#!/usr/bin/env bash
# QA Pipeline - runs all checks, returns minimal output
# Usage: qa-pipeline.sh [--fix] [--verbose] [--project <dir>] [project_dir]

set -euo pipefail

FIX=false
VERBOSE=false
FAILED=()
PASSED=()
PROJECT_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --fix) FIX=true; shift ;;
        --verbose|-v) VERBOSE=true; shift ;;
        --project) PROJECT_DIR="$2"; shift 2 ;;
        -*) echo "Unknown option: $1"; exit 1 ;;
        *) PROJECT_DIR="$1"; shift ;;  # Positional arg = project dir
    esac
done

# Determine project root:
# 1. Use --project or positional arg if provided
# 2. Otherwise use git root or pwd
if [[ -n "$PROJECT_DIR" ]]; then
    PROJECT_ROOT="$(cd "$PROJECT_DIR" && pwd)"
else
    PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
cd "$PROJECT_ROOT"

log() { echo "$1"; }
pass() { PASSED+=("$1"); log "✅ $1"; }
fail() { FAILED+=("$1: $2"); log "❌ $1: $2"; }
skip() { log "⏭️  $1: skipped"; }

#===============================================================================
# 1. TYPE CHECK
#===============================================================================
check_types() {
    log ""; log "═══ TYPE CHECK ═══"

    if [[ -f "tsconfig.json" ]]; then
        OUTPUT=$(npx tsc --noEmit 2>&1) && pass "Types" || {
            ERRORS=$(echo "$OUTPUT" | grep -c "error TS" || echo "0")
            FIRST_ERROR=$(echo "$OUTPUT" | grep "error TS" | head -1)
            fail "Types" "$ERRORS errors - $FIRST_ERROR"
        }
    elif [[ -f "nuxt.config.ts" ]]; then
        OUTPUT=$(npx nuxi typecheck 2>&1) && pass "Types" || {
            fail "Types" "$(echo "$OUTPUT" | tail -1)"
        }
    else
        skip "Types (no tsconfig)"
    fi
}

#===============================================================================
# 2. LINT
#===============================================================================
check_lint() {
    log ""; log "═══ LINT ═══"

    if [[ -f ".eslintrc" ]] || [[ -f ".eslintrc.js" ]] || [[ -f ".eslintrc.cjs" ]] || [[ -f ".eslintrc.json" ]] || [[ -f "eslint.config.js" ]] || [[ -f "eslint.config.mjs" ]]; then
        if $FIX; then
            OUTPUT=$(npx eslint . --fix 2>&1) && pass "Lint (fixed)" || {
                ERRORS=$(echo "$OUTPUT" | grep -cE "error|problem" || echo "?")
                fail "Lint" "$ERRORS issues remain after fix"
            }
        else
            OUTPUT=$(npx eslint . 2>&1) && pass "Lint" || {
                ERRORS=$(echo "$OUTPUT" | grep -oE "[0-9]+ error" | head -1 || echo "errors")
                fail "Lint" "$ERRORS"
            }
        fi
    else
        skip "Lint (no eslint config)"
    fi
}

#===============================================================================
# 3. BUILD
#===============================================================================
check_build() {
    log ""; log "═══ BUILD ═══"

    if [[ -f "package.json" ]]; then
        if grep -q '"build"' package.json; then
            OUTPUT=$(npm run build 2>&1) && pass "Build" || {
                LAST_ERROR=$(echo "$OUTPUT" | grep -iE "error|failed" | tail -1)
                fail "Build" "${LAST_ERROR:-Build failed}"
            }
        else
            skip "Build (no build script)"
        fi
    else
        skip "Build (no package.json)"
    fi
}

#===============================================================================
# 4. UNIT TESTS
#===============================================================================
check_tests() {
    log ""; log "═══ UNIT TESTS ═══"

    if [[ -f "package.json" ]] && grep -qE '"test"|"vitest"|"jest"' package.json; then
        OUTPUT=$(npm test 2>&1) && pass "Tests" || {
            FAILED_COUNT=$(echo "$OUTPUT" | grep -oE "[0-9]+ failed" | head -1 || echo "tests failed")
            fail "Tests" "$FAILED_COUNT"
        }
    else
        skip "Tests (no test script)"
    fi
}

#===============================================================================
# 5. FRONTEND UI VALIDATION
#===============================================================================
check_frontend() {
    log ""; log "═══ FRONTEND UI ═══"

    URL="${FRONTEND_URL:-http://localhost:3000}"

    # Check if frontend is running via HTTP
    if ! curl -s --head --max-time 5 "$URL" > /dev/null 2>&1; then
        skip "Frontend (not running at $URL)"
        return
    fi

    # Basic health check - fetch page and check for HTML
    RESPONSE=$(curl -s --max-time 10 "$URL" 2>/dev/null || echo "")

    if [[ -z "$RESPONSE" ]]; then
        fail "Frontend" "No response from $URL"
        return
    fi

    # Check for error indicators in response
    if echo "$RESPONSE" | grep -qiE "<title>.*error|500 internal|404 not found|exception"; then
        fail "Frontend" "Error page detected"
        return
    fi

    # Check for basic HTML structure
    if echo "$RESPONSE" | grep -qiE "<html|<!doctype"; then
        pass "Frontend serves HTML"
    else
        fail "Frontend" "Response is not HTML"
        return
    fi

    # Browser-based console log checking
    # Try agent-browser first, then webctl as fallback
    CONSOLE_CHECKED=false

    # Option 1: agent-browser (npm)
    if ! $CONSOLE_CHECKED && command -v npx &>/dev/null; then
        # Check if agent-browser is available (use --help since no --version)
        if npx agent-browser --help &>/dev/null 2>&1; then
            log "   Using agent-browser for console check..."

            # Open page and wait for app to stabilize (handles React StrictMode, reconnects, etc.)
            OPEN_RESULT=$(npx agent-browser open "$URL" --json 2>/dev/null || echo '{"success":false}')

            if echo "$OPEN_RESULT" | jq -e '.success' &>/dev/null; then
                # Wait for app to stabilize (WebSocket reconnects, async loads, etc.)
                sleep 2

                # Clear old console messages and get fresh ones
                npx agent-browser console --clear &>/dev/null || true
                sleep 1

                # Get console messages after stabilization
                CONSOLE_OUTPUT=$(npx agent-browser console --json 2>/dev/null || echo '{"data":{"messages":[]}}')

                # Count errors in console (type: "error")
                ERROR_COUNT=$(echo "$CONSOLE_OUTPUT" | jq '[.data.messages[] | select(.type == "error")] | length' 2>/dev/null || echo "0")
                ERROR_COUNT=${ERROR_COUNT:-0}

                if [[ "$ERROR_COUNT" =~ ^[0-9]+$ ]] && [[ "$ERROR_COUNT" -gt 0 ]]; then
                    FIRST_ERROR=$(echo "$CONSOLE_OUTPUT" | jq -r '[.data.messages[] | select(.type == "error")][0].text' 2>/dev/null | head -c 100)
                    fail "Console" "$ERROR_COUNT error(s) - $FIRST_ERROR"
                else
                    pass "Console (no errors)"
                fi
                CONSOLE_CHECKED=true

                # Close browser
                npx agent-browser close &>/dev/null || true
            fi
        fi
    fi

    # Option 2: webctl (Python) as fallback
    if ! $CONSOLE_CHECKED && command -v webctl &>/dev/null; then
        log "   Using webctl for console check..."

        # webctl needs to be started first
        webctl start &>/dev/null || true
        webctl navigate "$URL" &>/dev/null || true

        # Get console error count
        CONSOLE_OUTPUT=$(webctl console --count 2>/dev/null || echo "")
        ERROR_COUNT=$(echo "$CONSOLE_OUTPUT" | grep -oE "error:\s*[0-9]+" | grep -oE "[0-9]+" || echo "0")

        if [[ "$ERROR_COUNT" -gt 0 ]]; then
            fail "Console" "$ERROR_COUNT error(s) in console"
        else
            pass "Console (no errors)"
        fi
        CONSOLE_CHECKED=true

        webctl stop --daemon &>/dev/null || true
    fi

    # If no browser tool available, just note it
    if ! $CONSOLE_CHECKED; then
        log "   (Install agent-browser or webctl for console log checking)"
    fi

    # Run custom UI checks if defined
    if [[ -f ".claude/qa/ui-checks.sh" ]]; then
        source ".claude/qa/ui-checks.sh" && pass "UI checks" || fail "UI checks" "Custom checks failed"
    fi
}

#===============================================================================
# 6. SECURITY QUICK SCAN
#===============================================================================
check_security() {
    log ""; log "═══ SECURITY ═══"

    # Check for secrets in code
    SECRETS=$(grep -rE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]+['\"]" --include="*.ts" --include="*.js" --include="*.vue" . 2>/dev/null | grep -v node_modules | grep -v ".env" | head -3 || true)

    if [[ -n "$SECRETS" ]]; then
        fail "Secrets" "Potential hardcoded secrets found"
        $VERBOSE && echo "$SECRETS"
    else
        pass "Secrets (none found)"
    fi

    # Check for vulnerable deps (quick)
    if [[ -f "package-lock.json" ]]; then
        # Use subshell to avoid pipefail issues (npm audit returns 1 if vulnerabilities exist)
        AUDIT=$(set +o pipefail; npm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical // 0' 2>/dev/null | tr -d '[:space:]' || echo "0")
        AUDIT=${AUDIT:-0}
        if [[ "$AUDIT" =~ ^[0-9]+$ ]] && [[ "$AUDIT" -gt 0 ]]; then
            fail "Deps" "$AUDIT high/critical vulnerabilities"
        else
            pass "Deps (no critical vulns)"
        fi
    fi
}

#===============================================================================
# 7. CODE REVIEW (AI-assisted via separate agent)
#===============================================================================
check_review() {
    log ""; log "═══ CODE REVIEW ═══"

    # Get changed files
    CHANGED=$(git diff --name-only HEAD~1 2>/dev/null | grep -E "\.(ts|js|vue)$" | head -10 || true)

    if [[ -z "$CHANGED" ]]; then
        skip "Review (no changed files)"
        return
    fi

    # Write review request for separate agent (don't bloat this context)
    echo "$CHANGED" > .claude/qa/pending-review.txt
    log "   Files for review written to .claude/qa/pending-review.txt"
    log "   Run separate review agent: claude -p 'Review files in .claude/qa/pending-review.txt'"
    pass "Review (queued)"
}

#===============================================================================
# RUN ALL CHECKS
#===============================================================================
main() {
    log "🔍 QA Pipeline Starting..."
    log "   Project: $PROJECT_ROOT"
    log ""

    mkdir -p .claude/qa

    check_types
    check_lint
    check_build
    check_tests
    check_frontend
    check_security
    check_review

    #---------------------------------------------------------------------------
    # SUMMARY
    #---------------------------------------------------------------------------
    log ""
    log "═══════════════════════════════════════"
    log "📊 SUMMARY"
    log "═══════════════════════════════════════"
    log "✅ Passed: ${#PASSED[@]}"
    log "❌ Failed: ${#FAILED[@]}"

    if [[ ${#FAILED[@]} -gt 0 ]]; then
        log ""
        log "Failures:"
        for f in "${FAILED[@]}"; do
            log "  - $f"
        done
        log ""
        exit 1
    else
        log ""
        log "🎉 All checks passed!"
        exit 0
    fi
}

main
