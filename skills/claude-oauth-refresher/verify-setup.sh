#!/bin/bash
# verify-setup.sh - Pre-flight checks for claude-oauth-refresher
# Cross-platform: macOS + Linux

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

PLATFORM="linux"
[[ "$OSTYPE" == "darwin"* ]] && PLATFORM="macos"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  claude-oauth-refresher verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check 1: OS
echo -n "Checking OS... "
if [[ "$PLATFORM" == "macos" ]]; then
    echo -e "${GREEN}✓${NC} macOS $(sw_vers -productVersion) (Keychain mode)"
else
    echo -e "${GREEN}✓${NC} Linux $(uname -r) (file mode)"
fi

# Check 2: Claude CLI
echo -n "Checking Claude CLI... "
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>&1 | head -n1 || echo "unknown")
    echo -e "${GREEN}✓${NC} Found ($CLAUDE_VERSION)"
else
    echo -e "${YELLOW}⚠${NC} Not found (not required if already authenticated)"
    ((WARNINGS++))
fi

# Check 3: python3
echo -n "Checking python3... "
if command -v python3 &> /dev/null; then
    echo -e "${GREEN}✓${NC} Found"
else
    echo -e "${RED}✗${NC} Not found (required for JSON parsing)"
    ((ERRORS++))
fi

# Check 4: curl
echo -n "Checking curl... "
if command -v curl &> /dev/null; then
    echo -e "${GREEN}✓${NC} Found"
else
    echo -e "${RED}✗${NC} Not found"
    ((ERRORS++))
fi

# Check 5: Credentials (platform-specific)
echo -n "Checking credentials... "
if [[ "$PLATFORM" == "macos" ]]; then
    SERVICE="Claude Code-credentials"
    ALL_ACCOUNTS=$(security dump-keychain 2>/dev/null | \
        awk '/^class: "genp"/,/^keychain:/ {
            if (/"acct"<blob>=/) {
                gsub(/.*"acct"<blob>="/, "");
                gsub(/".*/, "");
                account=$0
            }
            if (/"svce"<blob>="'"$SERVICE"'"/) {
                print account
            }
        }' | sort -u)

    FOUND=false
    while IFS= read -r account; do
        [[ -z "$account" ]] && continue
        KEYCHAIN_DATA=$(security find-generic-password -s "$SERVICE" -a "$account" -w 2>/dev/null || echo "")
        if [[ -n "$KEYCHAIN_DATA" ]]; then
            HAS_TOKEN=$(echo "$KEYCHAIN_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'refreshToken' in data and data['refreshToken']:
    print('yes')
elif 'claudeAiOauth' in data and 'refreshToken' in data['claudeAiOauth']:
    print('yes')
else:
    print('no')
" 2>/dev/null || echo "no")
            if [[ "$HAS_TOKEN" == "yes" ]]; then
                FOUND=true
                echo -e "${GREEN}✓${NC} Keychain (account: $account)"
                break
            fi
        fi
    done <<< "$ALL_ACCOUNTS"

    if [[ "$FOUND" == "false" ]]; then
        echo -e "${RED}✗${NC} No valid OAuth tokens in Keychain"
        echo "  Run: claude auth"
        ((ERRORS++))
    fi
else
    # Linux: check credentials file
    CRED_FILE="$HOME/.claude/.credentials.json"
    if [[ -f "$CRED_FILE" ]]; then
        HAS_TOKEN=$(python3 -c "
import json
data = json.load(open('$CRED_FILE'))
if 'refreshToken' in data and data['refreshToken']:
    print('yes')
elif 'claudeAiOauth' in data and 'refreshToken' in data['claudeAiOauth']:
    print('yes')
else:
    print('no')
" 2>/dev/null || echo "no")
        if [[ "$HAS_TOKEN" == "yes" ]]; then
            echo -e "${GREEN}✓${NC} Found ($CRED_FILE)"
        else
            echo -e "${RED}✗${NC} File exists but no valid refresh token"
            echo "  Run: claude auth"
            ((ERRORS++))
        fi
    else
        echo -e "${RED}✗${NC} Not found: $CRED_FILE"
        echo "  Run: claude auth"
        ((ERRORS++))
    fi
fi

# Check 6: Telegram config
echo -n "Checking Telegram config... "
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -f "$PROJECT_DIR/.env" ]]; then
    BOT_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
    CHAT_ID=$(grep -E "^TELEGRAM_ALLOWED_USERS=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2- | cut -d, -f1 || true)
    if [[ -n "$BOT_TOKEN" ]] && [[ -n "$CHAT_ID" ]]; then
        echo -e "${GREEN}✓${NC} Found in .env (chat: $CHAT_ID)"
    else
        echo -e "${YELLOW}⚠${NC} Incomplete Telegram config in .env"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠${NC} No .env found (notifications won't work)"
    ((WARNINGS++))
fi

# Check 7: Script permissions
echo -n "Checking script permissions... "
if [[ -x "$SCRIPT_DIR/refresh-token.sh" ]]; then
    echo -e "${GREEN}✓${NC} Executable"
else
    echo -e "${YELLOW}⚠${NC} Not executable (run: chmod +x $SCRIPT_DIR/*.sh)"
    ((WARNINGS++))
fi

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ $ERRORS -eq 0 ]] && [[ $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) - setup should still work${NC}"
else
    echo -e "${RED}✗ $ERRORS error(s), $WARNINGS warning(s)${NC}"
    echo "Fix errors above before proceeding."
    exit 1
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
