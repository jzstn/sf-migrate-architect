#!/bin/bash

# Salesforce Migration Architect - Easy Setup Script
# Use this to install the tool globally on your machine.

echo "🚀 Starting installation of Salesforce Migration Architect..."

# 1. Check for Node.js
if ! [ -x "$(command -v node)" ]; then
  echo "❌ Error: Node.js is not installed. Please install it from https://nodejs.org/"
  exit 1
fi

# 2. Install dependencies
echo "📦 Installing internal dependencies..."
npm install

# 3. Make the main file executable
chmod +x src/index.js

# 4. Link the command globally
echo "🔗 Linking 'sf-migrate' command..."
sudo npm link --force

echo ""
echo "✅ Installation Complete!"
echo "You can now run the tool from anywhere using: sf-migrate"
echo ""
echo "Try running: sf-migrate demo"
