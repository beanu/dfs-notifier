import { NextResponse } from 'next/server';

interface Project {
  id: number;
  project_name: string;
  last_round: string;
  sec_per_round: number;
}

interface LikedProject {
  pid: number;
  time: string;
}

// DingTalk webhook URL
const dingTalkWebhookUrl = process.env.DINGTALK_WEBHOOK_URL;

// Function to fetch projects
async function fetchProjects(): Promise<Project[]> {
  try {
    const response = await fetch('https://8.138.81.44/v1/chain/get_table_rows', {
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
      }),
    });

    const data = await response.json();
    return data.rows;
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

// Function to fetch liked projects
async function fetchLikedProjects(account: string): Promise<LikedProject[]> {
  try {
    const response = await fetch('https://8.138.81.44/v1/chain/get_table_rows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: true,
        code: "dfs3protocol",
        scope: account,
        table: "likes",
        lower_bound: "",
        upper_bound: "",
        index_position: 1,
        key_type: "",
        limit: -1,
        reverse: false,
        show_payer: false
      }),
    });

    const data = await response.json();
    return data.rows;
  } catch (error) {
    console.error('Error fetching liked projects:', error);
    return [];
  }
}

// Function to check project countdown
function checkProjectCountdown(project: Project): { shouldNotify: boolean; minutesLeft: number } {
  const lastRound = new Date(project.last_round);
  const nextRound = new Date(lastRound.getTime() + (project.sec_per_round * 1000));
  const now = new Date();
  
  // 计算距离下一轮的分钟数和秒数
  const timeDiffMs = nextRound.getTime() - now.getTime();
  const timeDiffMinutes = Math.floor(timeDiffMs / (1000 * 60));
  const timeDiffSeconds = Math.floor((timeDiffMs / 1000) % 60);
  
  // 只在整好10分钟或3分钟，且在每分钟的前30秒内发送通知
  // 这样可以确保在每个目标时间点只发送一次通知
  const shouldNotify = 
    (timeDiffMinutes === 10 || timeDiffMinutes === 3)
  
  return { shouldNotify, minutesLeft: timeDiffMinutes };
}

// Function to send countdown notification
async function sendCountdownNotification(project: Project, minutesLeft: number): Promise<void> {
  if (!dingTalkWebhookUrl) {
    console.error('DingTalk webhook URL not configured');
    return;
  }

  const nextRoundTime = new Date(new Date(project.last_round).getTime() + (project.sec_per_round * 1000));
  
  const message = {
    msgtype: 'markdown',
    markdown: {
      title: 'DFS项目倒计时提醒',
      text: `### 项目倒计时提醒\n` +
            `- 项目名称：${project.project_name}\n` +
            `- 项目ID：${project.id}\n` +
            `- 下一轮开始时间：${nextRoundTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n` +
            `- ⏰ 距离下一轮开始还有${minutesLeft}分钟，请做好准备！`
    }
  };

  try {
    const response = await fetch(dingTalkWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to send DingTalk message: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error sending DingTalk message:', error);
  }
}

// Main handler for the cron job
export async function GET(req: Request) {
  try {
    // Fetch all projects
    const projects = await fetchProjects();
    
    // Use structured logging for better visibility in Vercel
    console.info(JSON.stringify({
      type: 'projects_fetched',
      count: projects.length,
      timestamp: new Date().toISOString(),
      data: projects
    }));
    
    // Fetch liked projects
    const likedProjects = await fetchLikedProjects("zhaoyunhello");
    console.info(JSON.stringify({
      type: 'liked_projects_fetched',
      count: likedProjects.length,
      timestamp: new Date().toISOString(),
      data: likedProjects
    }));
    
    // Check countdown for liked projects
    for (const project of projects) {
      const isLiked = likedProjects.some(lp => lp.pid === project.id);
      if (isLiked) {
        const { shouldNotify, minutesLeft } = checkProjectCountdown(project);
        console.info(JSON.stringify({
          type: 'project_countdown_check',
          project_id: project.id,
          project_name: project.project_name,
          should_notify: shouldNotify,
          minutes_left: minutesLeft,
          timestamp: new Date().toISOString()
        }));

        if (shouldNotify) {
          await sendCountdownNotification(project, minutesLeft);
          console.info(JSON.stringify({
            type: 'notification_sent',
            project_id: project.id,
            project_name: project.project_name,
            minutes_left: minutesLeft,
            timestamp: new Date().toISOString()
          }));
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }));
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
