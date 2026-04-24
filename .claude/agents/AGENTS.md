# BENDY-NAV 多 Agent 协作系统

## 架构

```
主控 (我) ──► 后端开发
    │
    ├── 前端 Agent ──► 页面 + GS MCP/Skills 安装
    │
    └── 运维 Agent ──► Docker/K8s/CircleCI/PostgreSQL

协作方式: 通过 .claude/agents/kanban.json 看板通信
```

## 工作目录

```
/home/myprojects/JavaScript/nextjs/bendy-nav-nextjs/
```

## 启动 Agent

前端 Agent:
```
claude -p /home/myprojects/JavaScript/nextjs/bendy-nav-nextjs --system-prepend .claude/agents/prompts/frontend.md
```

运维 Agent:
```
claude -p /home/myprojects/JavaScript/nextjs/bendy-nav-nextjs --system-prepend .claude/agents/prompts/devops.md
```

## 看板任务流转

backlog → in_progress → review → done

## 当前任务

看板文件: `.claude/agents/kanban.json`