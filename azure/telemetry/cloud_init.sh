#!/bin/bash
# cloud-init script — injected as custom data at VM creation.
# Placeholders ({{...}}) are substituted by provision.py before use.
set -euo pipefail

apt-get update -qq
apt-get install -y python3-pip
pip3 install requests --quiet

mkdir -p /opt/spotticker
cat > /opt/spotticker/agent.py << 'AGENT_EOF'
{{AGENT_SOURCE}}
AGENT_EOF

cat > /etc/systemd/system/spotticker-agent.service << EOF
[Unit]
Description=Spotticker heartbeat agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=COLLECTOR_URL={{COLLECTOR_URL}}
Environment=TELEMETRY_SECRET={{TELEMETRY_SECRET}}
Environment=VM_ID={{VM_ID}}
Environment=REGION={{REGION}}
Environment=SKU={{SKU}}
ExecStart=/usr/bin/python3 /opt/spotticker/agent.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable spotticker-agent
systemctl start spotticker-agent
