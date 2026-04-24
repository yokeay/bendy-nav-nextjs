const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8888;
const KANBAN_PATH = path.join(__dirname, 'kanban.json');

// Serve static files
app.use(express.static(__dirname));

// API endpoint to get kanban data
app.get('/api/kanban', (req, res) => {
    try {
        const data = fs.readFileSync(KANBAN_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read kanban.json' });
    }
});

// Main page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kanban Board - DevOps Agent</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            min-height: 100vh;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header h1 { color: #1a1a2e; font-size: 28px; margin-bottom: 10px; }
        .header .subtitle { color: #666; }
        .agents-bar {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }
        .agent {
            padding: 8px 16px;
            background: #e8f4f8;
            border-radius: 20px;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .agent .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4caf50;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .board {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            max-width: 1600px;
            margin: 0 auto;
        }
        @media (max-width: 1200px) {
            .board { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
            .board { grid-template-columns: 1fr; }
        }
        .column {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .column h2 {
            padding-bottom: 15px;
            margin-bottom: 15px;
            border-bottom: 3px solid;
            font-size: 18px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .column.backlog h2 { border-color: #ffa726; color: #e65100; }
        .column.in_progress h2 { border-color: #42a5f5; color: #1565c0; }
        .column.test h2 { border-color: #ab47bc; color: #7b1fa2; }
        .column.done h2 { border-color: #66bb6a; color: #2e7d32; }
        .count {
            background: #eee;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 14px;
            color: #666;
        }
        .task {
            background: #fafafa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 12px;
            border-left: 4px solid;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .task:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .task.priority-high { border-color: #ef5350; }
        .task.priority-medium { border-color: #ffa726; }
        .task.priority-low { border-color: #42a5f5; }
        .task-id {
            font-size: 12px;
            color: #999;
            font-weight: 600;
        }
        .task-title {
            font-size: 15px;
            font-weight: 600;
            color: #333;
            margin: 8px 0;
            line-height: 1.4;
        }
        .task-meta {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 10px;
        }
        .badge {
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 12px;
            background: #e0e0e0;
            color: #555;
        }
        .badge.assignee { background: #e3f2fd; color: #1565c0; }
        .badge.priority-high { background: #ffebee; color: #c62828; }
        .badge.priority-medium { background: #fff3e0; color: #ef6c00; }
        .badge.priority-low { background: #e3f2fd; color: #1565c0; }
        .task-desc {
            font-size: 13px;
            color: #666;
            margin-top: 10px;
            line-height: 1.5;
        }
        .refresh-info {
            text-align: center;
            margin-top: 20px;
            color: #999;
            font-size: 13px;
        }
        .error {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Kanban Board</h1>
        <div class="subtitle">DevOps Agent - Real-time Task Status</div>
        <div class="agents-bar" id="agents"></div>
    </div>
    
    <div class="board">
        <div class="column backlog">
            <h2>Backlog <span class="count" id="backlog-count">0</span></h2>
            <div id="backlog-tasks"></div>
        </div>
        <div class="column in_progress">
            <h2>In Progress <span class="count" id="in-progress-count">0</span></h2>
            <div id="in-progress-tasks"></div>
        </div>
        <div class="column test">
            <h2>Test <span class="count" id="test-count">0</span></h2>
            <div id="test-tasks"></div>
        </div>
        <div class="column done">
            <h2>Done <span class="count" id="done-count">0</span></h2>
            <div id="done-tasks"></div>
        </div>
    </div>
    
    <div class="refresh-info">
        Auto-refreshing every 10 seconds | Last updated: <span id="last-updated">-</span>
    </div>

    <script>
        function renderKanban(data) {
            // Render agents
            const agentsHtml = Object.entries(data.agents).map(([key, agent]) => 
                '<div class="agent"><span class="dot"></span>' + agent.name + ' (' + agent.role + ')</div>'
            ).join('');
            document.getElementById('agents').innerHTML = agentsHtml;

            // Helper to render tasks
            function renderTasks(tasks) {
                if (!tasks || tasks.length === 0) {
                    return '<div style="color:#999;text-align:center;padding:20px;">No tasks</div>';
                }
                return tasks.map(task => '
                    <div class="task priority-' + task.priority + '">
                        <div class="task-id">' + task.id + '</div>
                        <div class="task-title">' + task.title + '</div>
                        <div class="task-meta">
                            <span class="badge assignee">' + (data.agents[task.assignee]?.name || task.assignee) + '</span>
                            <span class="badge priority-' + task.priority + '">' + task.priority + '</span>
                        </div>
                        <div class="task-desc">' + task.description + '</div>
                    </div>
                ').join('');
            }

            document.getElementById('backlog-tasks').innerHTML = renderTasks(data.tasks.backlog);
            document.getElementById('in-progress-tasks').innerHTML = renderTasks(data.tasks.in_progress);
            document.getElementById('test-tasks').innerHTML = renderTasks(data.tasks.test);
            document.getElementById('done-tasks').innerHTML = renderTasks(data.tasks.done);

            document.getElementById('backlog-count').textContent = data.tasks.backlog.length;
            document.getElementById('in-progress-count').textContent = data.tasks.in_progress.length;
            document.getElementById('test-count').textContent = data.tasks.test.length;
            document.getElementById('done-count').textContent = data.tasks.done.length;

            document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
        }

        async function fetchKanban() {
            try {
                const res = await fetch('/api/kanban');
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                renderKanban(data);
            } catch (err) {
                console.error('Error fetching kanban:', err);
            }
        }

        // Initial load
        fetchKanban();
        // Auto-refresh every 10 seconds
        setInterval(fetchKanban, 10000);
    </script>
</body>
</html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kanban server running at http://138.199.165.36:${PORT}`);
    console.log(`API endpoint: http://138.199.165.36:${PORT}/api/kanban`);
});
