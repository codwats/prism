#!/bin/bash
# PRISM Git Sync Instructions
# Run this to get your local repository in sync with remote

echo "🔮 PRISM Git Sync"
echo ""
echo "Step 1: Fetch all changes from remote..."
git fetch origin

echo ""
echo "Step 2: Switch to main and pull latest..."
git checkout main
git pull origin main

echo ""
echo "Step 3: Check what's on main..."
git log --oneline -5

echo ""
echo "✅ Your main branch is now up to date!"
echo ""
echo "Next steps:"
echo "  - If you merged the claude branch PR: You're all set!"
echo "  - If you want to continue working: git checkout claude/mtg-prism-deck-tool-N946B"
echo "  - To merge main into your branch: git merge main"
