简体中文 | [English](./README.en.md)

<div align="center">
<h1>site-status-v3</h1>
<p>一个基于 UptimeRobot API v3 的在线状态面板</p>
<br />
<img src="https://img.shields.io/badge/UptimeRobot-API%20v3-brightgreen" alt="UptimeRobot API v3"/>
<img src="https://img.shields.io/badge/Nuxt-3-00DC82" alt="Nuxt 3"/>
<br />
<br />
</div>

site-status-v3 是一个轻量、开源的站点状态页，使用 UptimeRobot API v3 拉取监控与故障事件数据，并以 60 天可用率日历展示站点运行情况。它适合个人主页、博客、小型产品和服务集群，用一套环境变量即可快速部署到 Vercel、Cloudflare Pages 或其他 Nuxt 兼容平台。

## Demo

在线预览：<https://status.itvv.cn/>

![site-status-v3 Demo](./public/demo.png)
>图片由AI生成仅供参考
## 特色

- 多平台部署支持
- 优雅且流畅的浏览体验
- 支持站点密码加密（JWT + Hash）
- 全站状态预览
- 数据定时刷新
- 移动端适配

## 事先准备

- 你需要先在 [UptimeRobot](https://uptimerobot.com/dashboard) 添加站点监控，并在 [API Management](https://dashboard.uptimerobot.com/integrations) 获取 `Read-Only API Key`。请不要使用或提交 `Main API key`。
- 本项目使用 UptimeRobot API v3 获取监控和故障事件数据。

## 部署

### Cloudflare

本项目支持使用 [Cloudflare Pages](https://pages.cloudflare.com/) 部署。

- Fork 本项目。
- 按 `.env.example` 配置环境变量，其中 `API_KEY` 为必填项。
- 构建命令使用 `npm run build`。
- 部署完成后访问站点首页确认数据加载正常。

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-name/site-status-v3)

- 点击上方按钮前往部署。
- 按 `.env.example` 配置环境变量，其中 `DEPLOYMENT_PLATFORM` 建议设置为 `auto`。
- `API_KEY` 必须使用 UptimeRobot Read-Only API key。

### 其他托管平台

请参考官方文档：[部署 Nuxt 应用](https://nuxtjs.org.cn/deploy)

## 环境变量

| 变量名称 | 必填 | 说明 |
| --- | --- | --- |
| `API_URL` | 是 | UptimeRobot API 地址，默认 `https://api.uptimerobot.com/` |
| `API_KEY` | 是 | UptimeRobot Read-Only API key |
| `DEPLOYMENT_PLATFORM` | 是 | `cloudflare` 或 `auto` |
| `SITE_TITLE` | 否 | 站点标题 |
| `SITE_DESCRIPTION` | 否 | 站点描述 |
| `SITE_KEYWORDS` | 否 | 站点关键词 |
| `SITE_LOGO` | 否 | 站点图标 |
| `SITE_ICP` | 否 | ICP 备案号 |
| `COUNT_DAYS` | 否 | 展示天数，建议 30 到 90 |
| `SHOW_LINK` | 否 | 是否展示监控站点链接 |
| `SITE_PASSWORD` | 否 | 站点访问密码 |
| `SITE_SECRET_KEY` | 否 | JWT 加密密钥，启用密码保护时建议填写 |

## Q & A

### 如何开启站点加密

在环境变量中添加 `SITE_PASSWORD` 和 `SITE_SECRET_KEY`。`SITE_PASSWORD` 是站点密码，`SITE_SECRET_KEY` 是加密密钥，请使用随机字符串并避免提交真实值。

## 鸣谢

- [uptime-status](https://github.com/imsyy/site-status) 启发了本项目
