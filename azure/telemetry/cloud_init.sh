#!/bin/bash
# cloud-init script — injected as custom data at VM creation.
# Placeholders ({{...}}) are substituted by common.build_cloud_init before use.
set -euo pipefail

apt-get update -qq
apt-get install -y -qq python3-requests

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
Environment="COLLECTOR_URL={{COLLECTOR_URL}}"
Environment="TELEMETRY_SECRET={{TELEMETRY_SECRET}}"
Environment="VM_ID={{VM_ID}}"
Environment="REGION={{REGION}}"
Environment="SKU={{SKU}}"
ExecStart=/usr/bin/python3 /opt/spotticker/agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable spotticker-agent
systemctl start spotticker-agent
