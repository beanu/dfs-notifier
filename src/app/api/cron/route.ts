import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Define types for the project
interface Project {
  id: number;
  creator: string;
  project_name: string;
  nft_name: string;
  nft_img: string;
  desc: string;
  init_nft_number: number;
  init_nft_price: string;
  create_time: string;
}

interface TokenBalance {
  code: string;
  account: string;
  symbol: string | null;
}

export const dynamic = 'force-dynamic';

// DingTalk webhook URL
const dingTalkWebhookUrl = process.env.DINGTALK_WEBHOOK_URL;

// Initialize Redis client
const redis = Redis.fromEnv();

// Key for storing last project ID
const LAST_PROJECT_ID_KEY = 'last_project_id';

// Function to fetch projects
async function fetchProjects(): Promise<Project[]> {
  try {
    const response = await fetch('https://8.138.81.44/v1/chain/get_table_rows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-cache',
      body: JSON.stringify({
        json: true,
        code: "dfs3protocol",
        scope: "dfs3protocol",
        table: "projects",
        lower_bound: "",
        upper_bound: "",
        index_position: 1,
        key_type: "",
        limit: -1,
        reverse: true,
        show_payer: false
      })
    });

    const data = await response.json();
    return data.rows as Project[];
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

// Function to fetch token balance
async function fetchTokenBalance(creator: string, tokenCode: string): Promise<string[]> {
  try {
    const response = await fetch('https://8.138.81.44/v1/chain/get_currency_balance', {
      method: 'POST',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: tokenCode,
        account: creator,
        symbol: null
      })
    });

    const data = await response.json();
    return data as string[];
  } catch (error) {
    console.error(`Error fetching ${tokenCode} balance:`, error);
    return [];
  }
}

// Function to convert UTC to local time
function convertToLocalTime(utcTime: string): string {
  const date = new Date(utcTime);
  return date.toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// Function to send DingTalk message
async function sendDingTalkMessage(project: Project): Promise<void> {
  if (!dingTalkWebhookUrl) {
    console.error('DingTalk webhook URL is missing');
    return;
  }

  // Fetch creator's balances
  const dfsBalances = await fetchTokenBalance(project.creator, 'eosio.token');
  const tokenBalances = await fetchTokenBalance(project.creator, 'dfsppptokens');

  const message = {
    msgtype: "text",
    text: {
      content: `🆕 DFS 新项目创建提醒!\n\n` +
        `📝 项目名称: ${project.project_name}\n` +
        `🎨 NFT名称: ${project.nft_name}\n` +
        `👤 创建者: ${project.creator}\n` +
        `💰 初始价格: ${project.init_nft_price}\n` +
        `🔢 初始NFT数量: ${project.init_nft_number}\n` +
        `📅 创建时间: ${convertToLocalTime(project.create_time)}\n\n` +
        `💎 创建者资产:\n` +
        `DFS代币: ${dfsBalances.length > 0 ? dfsBalances[0] : '0 DFS'}\n` +
        `其他代币:\n${tokenBalances.map(balance => `- ${balance}`).join('\n')}`
    },
    at: {
      isAtAll: false
    }
  };

  try {
    const response = await fetch(dingTalkWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      throw new Error(`DingTalk API error: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending DingTalk message:', error);
  }
}

// Main handler for the cron job
export async function GET() {
  try {
    const projects = await fetchProjects();

    if (projects.length > 0) {
      const latestProjectId = projects[0].id;
      
      // Get last known project ID from Redis
      const lastProjectId = Number(await redis.get(LAST_PROJECT_ID_KEY)) || 113;
      console.log(`read from redis: ${lastProjectId}`,`the latest project id: ${latestProjectId}`);
      
      // Check if we have new projects
      if (latestProjectId > lastProjectId) {
        // Get all new projects
        const newProjects = projects.filter((p: Project) => p.id > lastProjectId);
        
        // Send notification for each new project
        for (const project of newProjects) {
          await sendDingTalkMessage(project);
        }
        
        // Update the last known project ID in Redis
        await redis.set(LAST_PROJECT_ID_KEY, latestProjectId);
      }

    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
