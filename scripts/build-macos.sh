#!/usr/bin/env bash
# macOS 向けの配布用 .dmg を作る。既定は Apple Silicon と Intel の両方で動く Universal ビルド。
#
#   ./scripts/build-macos.sh            Universal（両方の Mac で動く・時間がかかる）
#   ./scripts/build-macos.sh --native   この Mac の CPU 向けだけ（速い）
#
# 必要なもの：Xcode Command Line Tools と Node.js。Rust（rustup）が無ければ自動で入れる。
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nエラー: %s\n' "$*" >&2; exit 1; }

MODE=universal
case "${1:-}" in
  "") ;;
  --native) MODE=native ;;
  *) die "不明な引数です: $1（使えるのは --native だけです）" ;;
esac

[ "$(uname -s)" = "Darwin" ] || die "このスクリプトは macOS で実行してください。"

say "Xcode Command Line Tools を確認"
if ! xcode-select -p >/dev/null 2>&1; then
  xcode-select --install || true
  die "Xcode Command Line Tools のインストールを開始しました。完了したら、もう一度このスクリプトを実行してください。"
fi

say "Node.js を確認"
command -v node >/dev/null 2>&1 || die "Node.js が見つかりません。https://nodejs.org/ から LTS 版を入れてから、もう一度実行してください。"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 以上が必要です（今は $(node -v)）。"
echo "Node.js $(node -v)"

say "Rust を確認"
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust（rustup）をインストールします。"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
RUST_MINOR=$(rustc --version | awk '{split($2, v, "."); print v[2]}')
if [ "$RUST_MINOR" -lt 90 ]; then
  echo "Rust が古いため更新します（Tauri には 1.90 以上が必要です）。"
  rustup update stable
fi
rustc --version

if [ "$MODE" = universal ]; then
  say "Apple Silicon / Intel 用の Rust ターゲットを追加"
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
fi

say "npm パッケージをインストール"
npm ci

say "アプリをビルドして .dmg を作成（初回は Finder の操作許可を求められることがあります）"
if [ "$MODE" = universal ]; then
  npm run tauri build -- --target universal-apple-darwin
  BUNDLE_DIR=src-tauri/target/universal-apple-darwin/release/bundle/dmg
else
  npm run tauri build
  BUNDLE_DIR=src-tauri/target/release/bundle/dmg
fi

DMG=$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.dmg' 2>/dev/null | head -n 1 || true)
[ -n "$DMG" ] || die "dmg が見つかりませんでした: $BUNDLE_DIR"

say "完了"
echo "$PWD/$DMG"
echo "開き方：.dmg を開き、Nanatsuya を Applications にドラッグします。"
echo "署名していないため、初回は Finder で App を右クリック →「開く」で起動してください。"
open "$BUNDLE_DIR"
