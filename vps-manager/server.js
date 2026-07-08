import express from 'express';
import cors from 'cors';
import si from 'systeminformation';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const app = express();
const PORT = process.env.PORT || 3010;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Metrics history storage (24 hours, sampled every 30 seconds)
const metricsHistory = [];
const MAX_HISTORY = 2880; // 24h * 60min / 0.5min = 2880 data points

app.use(cors());
app.use(express.json());

// API endpoints BEFORE static files
app.get('/api/metrics', async (req, res) => {
  try {
    const [cpu, mem, disk, processes] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.processes()
    ]);

    // Get Docker containers
    let containers = [];
    try {
      const dockerOutput = execSync('docker ps --format "{{.Names}}|{{.Status}}|{{.Ports}}"', {
        encoding: 'utf-8'
      });
      containers = dockerOutput
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => {
          const [name, status, ports] = line.split('|');
          return { name, status, ports };
        });
    } catch (e) {
      // Docker might not be available or no containers
    }

    // Get PM2 apps
    let pm2Apps = [];
    try {
      const pm2Output = execSync('pm2 list --no-ansi 2>/dev/null | grep -E "│" | grep -v "^│ id" | grep -v "^─"', {
        encoding: 'utf-8',
        shell: '/bin/bash'
      });
      pm2Apps = pm2Output
        .trim()
        .split('\n')
        .filter(line => line.includes('online') || line.includes('stopped'))
        .map(line => {
          const match = line.match(/│\s+(\d+)\s+│\s+(\S+)\s+│\s+(\w+)\s+│/);
          if (match) {
            return { id: match[1], name: match[2], status: match[3] };
          }
          return null;
        })
        .filter(Boolean);
    } catch (e) {
      // PM2 might not be available
    }

    // Get main disk (root)
    const rootDisk = disk.find(d => d.mount === '/') || disk[0];

    const metrics = {
      cpu: {
        usage: Math.round(cpu.currentLoad),
        cores: cpu.cores
      },
      memory: {
        used: Math.round(mem.used / 1024 / 1024 / 1024 * 100) / 100,
        total: Math.round(mem.total / 1024 / 1024 / 1024 * 100) / 100,
        percent: Math.round((mem.used / mem.total) * 100)
      },
      disk: {
        used: Math.round(rootDisk.used / 1024 / 1024 / 1024 * 100) / 100,
        total: Math.round(rootDisk.size / 1024 / 1024 / 1024 * 100) / 100,
        percent: Math.round((rootDisk.used / rootDisk.size) * 100),
        mount: rootDisk.mount
      },
      containers,
      pm2Apps,
      timestamp: new Date().toISOString()
    };

    // Store in history every 30 seconds
    if (metricsHistory.length === 0 ||
        (new Date() - new Date(metricsHistory[metricsHistory.length - 1].timestamp)) > 30000) {
      metricsHistory.push({
        cpu: metrics.cpu.usage,
        memory: metrics.memory.percent,
        disk: metrics.disk.percent,
        timestamp: metrics.timestamp
      });
      if (metricsHistory.length > MAX_HISTORY) {
        metricsHistory.shift();
      }
    }

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/metrics-history', (req, res) => {
  try {
    res.json({
      history: metricsHistory,
      count: metricsHistory.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/restart', (req, res) => {
  try {
    execSync('sudo reboot', { timeout: 5000 });
    res.json({ success: true, message: 'VPS restarting...' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/restart-container/:name', (req, res) => {
  try {
    const { name } = req.params;
    execSync(`docker restart ${name}`);
    res.json({ success: true, message: `Container ${name} restarted` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/restart-service/:name', (req, res) => {
  try {
    const { name } = req.params;
    execSync(`systemctl restart ${name}`);
    res.json({ success: true, message: `Service ${name} restarted` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/container/:name/control', (req, res) => {
  try {
    const { name } = req.params;
    const { action } = req.body;
    const validActions = ['restart', 'stop', 'start'];

    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    execSync(`docker ${action} ${name}`);
    res.json({ success: true, message: `Container ${name} ${action}ed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/container/:name/logs', (req, res) => {
  try {
    const { name } = req.params;
    const lines = req.query.lines || 50;
    const logs = execSync(`docker logs --tail ${lines} ${name}`, {
      encoding: 'utf-8'
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  try {
    const services = [
      { name: 'Palama', container: 'palama-frontend', url: 'http://localhost:3100' },
      { name: 'Constellation', container: 'constellation-media', url: null },
      { name: 'World Game', url: 'http://localhost:8501' },
      { name: 'Backend API', url: 'http://localhost:8000' },
      { name: 'PostgreSQL', port: 5432 },
      { name: 'Redis', port: 6379 },
    ];

    const health = services.map(s => {
      let status = 'unknown';
      if (s.container) {
        try {
          execSync(`docker ps --filter "name=${s.container}" --quiet | grep -q .`, {
            stdio: 'pipe'
          });
          status = 'running';
        } catch {
          status = 'stopped';
        }
      } else if (s.port) {
        try {
          execSync(`netstat -tuln 2>/dev/null | grep -q ":${s.port}"`, {
            stdio: 'pipe'
          });
          status = 'running';
        } catch {
          status = 'stopped';
        }
      }
      return { name: s.name, status, type: s.container ? 'container' : 'service' };
    });

    res.json({ services: health });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Jarvis Tracking Proxy (avoid CORS issues)
function proxyJarvisAPI(endpoint, res) {
  const url = `http://localhost:9999${endpoint}`;
  const request = http.get(url, (jarvisRes) => {
    let data = '';
    jarvisRes.on('data', (chunk) => (data += chunk));
    jarvisRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        res.json(parsed);
      } catch (e) {
        console.error('Failed to parse Jarvis response:', data);
        res.json({ success: false, error: 'Invalid response from Jarvis', details: data });
      }
    });
  }).on('error', (error) => {
    console.error('Jarvis proxy error:', error);
    res.json({ success: false, error: error.message || 'Connection failed', code: error.code });
  });

  request.setTimeout(5000, () => {
    request.destroy();
    res.json({ success: false, error: 'Request timeout' });
  });
}

app.get('/api/jarvis/tracking/recent', (req, res) => {
  const limit = req.query.limit || 50;
  proxyJarvisAPI(`/api/tracking/recent?limit=${limit}`, res);
});

app.get('/api/jarvis/tracking/by-project', (req, res) => {
  proxyJarvisAPI('/api/tracking/by-project', res);
});

app.get('/api/jarvis/tracking/timeline', (req, res) => {
  const hours = req.query.hours || 24;
  proxyJarvisAPI(`/api/tracking/timeline?hours=${hours}`, res);
});

// Serve static files from dist directory (AFTER API routes)
app.use(express.static(path.join(__dirname, 'dist')));

// Serve React app (catch-all for SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VPS Manager running on http://localhost:${PORT}`);
});
