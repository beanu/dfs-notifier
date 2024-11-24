import { NextResponse } from 'next/server';

// DingTalk webhook URL
const dingTalkWebhookUrl = process.env.DINGTALK_WEBHOOK_URL;

// Store the last known project ID
let lastProjectId = 1;

// Function to fetch projects
async function fetchProjects() {
  try {
    const response = await fetch('https://119.45.185.193/v1/chain/get_table_rows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    return data.rows;
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

// Function to send DingTalk message
async function sendDingTalkMessage(project: any) {
  if (!dingTalkWebhookUrl) {
    console.error('DingTalk webhook URL is missing');
    return;
  }

  const message = {
    msgtype: "text",
    text: {
      content: `🆕 新项目创建提醒!\n\n` +
        `📝 项目名称: ${project.project_name}\n` +
        `🎨 NFT名称: ${project.nft_name}\n` +
        `👤 创建者: ${project.creator}\n` +
        `💰 初始价格: ${project.init_nft_price}\n` +
        `🔢 初始NFT数量: ${project.init_nft_number}\n` +
        `📅 创建时间: ${project.create_time}`
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
      
      // Check if we have new projects
      if (lastProjectId > 0 && latestProjectId > lastProjectId) {
        // Get all new projects
        const newProjects = projects.filter(p => p.id > lastProjectId);
        
        // Send notification for each new project
        for (const project of newProjects) {
          await sendDingTalkMessage(project);
        }
      }
      
      // Update the last known project ID
      lastProjectId = latestProjectId;
    }

    return NextResponse.json({ success: true, lastProjectId });
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
