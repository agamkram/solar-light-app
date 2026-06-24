#!/bin/bash
cd "$(dirname "$0")"

export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/id_ed25519_github -o IdentitiesOnly=yes"

echo "Pushing to github.com/agamkram/solar-light-app ..."
git push -u origin main --force

if [ $? -eq 0 ]; then
  echo ""
  echo "Done. Vercel should redeploy in about a minute."
else
  echo ""
  echo "Push failed."
  echo "Create the repo at https://github.com/new (name: solar-light-app), then try again."
  echo "SSH key help: ADD-SSH-KEY-TO-GITHUB.txt"
fi

echo ""
read -r -p "Press Enter to close..."