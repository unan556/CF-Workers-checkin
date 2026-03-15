let domain = "这里填机场域名";
let user = "这里填邮箱";
let pass = "这里填密码";
let 签到结果;
let BotToken ='';
let ChatID =''; 

export default {
    async fetch(request, env, ctx) {
        await initializeVariables(env);
        const url = new URL(request.url);
        
        if (url.pathname == "/tg") {
            await sendMessage();
        } else if (url.pathname == `/${pass}`) {
            await checkin();
        }
        
        return new Response(签到结果, {
            status: 200,
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
    },

    async scheduled(controller, env, ctx) {
        console.log('Cron job started');
        try {
            await initializeVariables(env);
            await checkin();
            console.log('Cron job completed successfully');
        } catch (error) {
            console.error('Cron job failed:', error);
            签到结果 = `定时任务执行失败: ${error.message}`;
            await sendMessage(签到结果);
        }
    },
};

async function initializeVariables(env) {
    domain = env.JC || env.DOMAIN || domain;
    user = env.ZH || env.USER || user;
    pass = env.MM || env.PASS || pass;
    // 自动补全 https
    if (!domain.includes("//")) domain = `https://${domain}`;
    
    BotToken = env.TGTOKEN || BotToken;
    ChatID = env.TGID || ChatID;
    签到结果 = `地址: ${domain.substring(0, 9)}****${domain.substring(domain.length - 5)}\n账号: ${user.substring(0, 1)}****${user.substring(user.length - 5)}\n密码: ${pass.substring(0, 1)}****${pass.substring(pass.length - 1)}\n\nTG推送: ${ChatID ? `${ChatID.substring(0, 1)}****${ChatID.substring(ChatID.length - 3)}` : "未启用"}`;
}

async function sendMessage(msg = "") {
    const 账号信息 = `地址: ${domain}\n账号: ${user}\n密码: <tg-spoiler>${pass}</tg-spoiler>`;
    const now = new Date();
    // 转换为北京时间
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const formattedTime = beijingTime.toISOString().slice(0, 19).replace('T', ' ');
    console.log(msg);
    
    if (BotToken !== '' && ChatID !== '') {
        const url = `https://api.telegram.org/bot${BotToken}/sendMessage?chat_id=${ChatID}&parse_mode=HTML&text=${encodeURIComponent("执行时间: " + formattedTime + "\n" + 账号信息 + "\n\n" + msg)}`;
        return fetch(url, {
            method: 'get',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mozilla/5.0 Chrome/90.0.4430.72'
            }
        });
    } else if (ChatID !== "") {
        // 兼容第三方 TG 代理
        const url = `https://api.tg.090227.xyz/sendMessage?chat_id=${ChatID}&parse_mode=HTML&text=${encodeURIComponent("执行时间: " + formattedTime + "\n" + 账号信息 + "\n\n" + msg)}`;
        return fetch(url, {
            method: 'get',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mozilla/5.0 Chrome/90.0.4430.72'
            }
        });
    }
}

async function checkin() {
    try {
        if (!domain || !user || !pass) {
            throw new Error('必需的配置参数缺失');
        }

        console.log(`正在尝试登录: ${domain}`);
        
        // 1. 发送登录请求
        const loginResponse = await fetch(`${domain}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Origin': domain,
                'Referer': `${domain}/auth/login`,
            },
            body: JSON.stringify({
                email: user,
                passwd: pass,
                remember_me: 'on',
                code: "",
            }),
        });

        console.log('登录请求状态码:', loginResponse.status);
        
        const loginText = await loginResponse.text();
        
        // 拦截机场开启 Cloudflare 五秒盾或人机验证的情况
        if (loginText.includes('Just a moment') || loginText.includes('cloudflare')) {
            throw new Error('被目标网站的安全防御(如Cloudflare五秒盾)拦截，IP可能被暂时风控');
        }

        let loginJson;
        try {
            loginJson = JSON.parse(loginText);
        } catch (e) {
            throw new Error(`登录返回的数据不是JSON格式 (可能被防火墙拦截):\n${loginText.substring(0, 100)}...`);
        }

        if (loginJson.ret !== 1) {
            throw new Error(`面板返回登录失败: ${loginJson.msg || '未知错误'}`);
        }

        // 2. 现代且安全的 Cookie 提取方式（修复逗号 Bug）
        const cookieArray = loginResponse.headers.getSetCookie();
        if (!cookieArray || cookieArray.length === 0) {
            throw new Error('登录成功，但未从响应头中获取到 Set-Cookie');
        }

        // 提取每个 Cookie 的键值对部分，忽略后面的 Expires, Path 等属性
        const cookies = cookieArray.map(cookie => cookie.split(';')[0].trim()).join('; ');
        console.log('成功解析的 Cookie:', cookies);

        // 稍微等待，防止请求过快被识别为机器
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. 发送签到请求
        const checkinResponse = await fetch(`${domain}/user/checkin`, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Origin': domain,
                'Referer': `${domain}/user/panel`,
                'X-Requested-With': 'XMLHttpRequest'
            },
        });

        console.log('签到请求状态码:', checkinResponse.status);
        const responseText = await checkinResponse.text();
        
        try {
            const checkinResult = JSON.parse(responseText);
            if (checkinResult.ret === 1 || checkinResult.ret === 0) {
                签到结果 = `🎉 签到结果 🎉\n ${checkinResult.msg || (checkinResult.ret === 1 ? '签到成功' : '今日已签到过')}`;
            } else {
                签到结果 = `⚠️ 签到异常 ⚠️\n ${checkinResult.msg || '签到结果未知'}`;
            }
        } catch (e) {
            if (responseText.includes('登录') || responseText.includes('login')) {
                throw new Error('携带的 Cookie 依然被服务器拒绝，登录状态无效');
            }
            throw new Error(`解析签到响应失败: ${e.message}\n原始响应: ${responseText.substring(0, 50)}...`);
        }

        await sendMessage(签到结果);
        return 签到结果;

    } catch (error) {
        console.error('Checkin Error:', error);
        签到结果 = `❌ 签到过程发生错误:\n${error.message}`;
        await sendMessage(签到结果);
        return 签到结果;
    }
}
