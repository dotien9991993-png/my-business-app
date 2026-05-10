#!/bin/bash
# iOS release helper — giống `eas build` của Expo
#
# Cách dùng:
#   npm run ios:bump:patch      → 1.0.0 → 1.0.1, build +1
#   npm run ios:bump:minor      → 1.0.0 → 1.1.0, build +1
#   npm run ios:bump:major      → 1.0.0 → 2.0.0, build +1
#   npm run ios:bump:build      → giữ version, chỉ +1 build (cho khi resubmit cùng version)
#   npm run ios:release         → bump build + build web + sync + open Xcode

set -e

cd "$(dirname "$0")/.."
IOS_DIR="ios/App"
PBXPROJ="$IOS_DIR/App.xcodeproj/project.pbxproj"

if [ ! -f "$PBXPROJ" ]; then
  echo "❌ Không tìm thấy $PBXPROJ"
  exit 1
fi

MODE="${1:-build}"

# Đọc version hiện tại từ pbxproj
CURRENT_VERSION=$(grep -m1 "MARKETING_VERSION" "$PBXPROJ" | sed -E 's/.*= ([^;]+);/\1/' | tr -d '"')
CURRENT_BUILD=$(grep -m1 "CURRENT_PROJECT_VERSION" "$PBXPROJ" | sed -E 's/.*= ([^;]+);/\1/')

echo "📱 Version hiện tại: $CURRENT_VERSION (build $CURRENT_BUILD)"

# Tính version mới
IFS='.' read -ra V <<< "$CURRENT_VERSION"
MAJOR=${V[0]:-1}
MINOR=${V[1]:-0}
PATCH=${V[2]:-0}

case "$MODE" in
  major)
    MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  minor)
    MINOR=$((MINOR + 1)); PATCH=0
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  patch)
    PATCH=$((PATCH + 1))
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  build)
    NEW_VERSION="$CURRENT_VERSION"
    ;;
  *)
    echo "❌ Mode không hợp lệ: $MODE (dùng: major|minor|patch|build)"
    exit 1
    ;;
esac

NEW_BUILD=$((CURRENT_BUILD + 1))

echo "🆕 Version mới: $NEW_VERSION (build $NEW_BUILD)"

# Cập nhật project.pbxproj — đổi tất cả MARKETING_VERSION và CURRENT_PROJECT_VERSION
sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $NEW_VERSION;/g" "$PBXPROJ"
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $NEW_BUILD;/g" "$PBXPROJ"

echo "✅ Đã cập nhật project.pbxproj"
echo ""
echo "Tiếp theo:"
echo "  npm run build && npx cap sync ios && npx cap open ios"
echo "  Hoặc chạy: npm run ios:release"
