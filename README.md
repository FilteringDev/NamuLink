## NamuLink

[![jsDelivr Stats](https://data.jsdelivr.com/v1/package/npm/@filteringdev/namulink/badge)](https://www.jsdelivr.com/package/npm/@filteringdev/namulink)

NamuLink 유저스크립트는 나무위키 프론트엔드에 있는 파워링크 광고를 2차원 기하학 & 3차원 기하학 기반의 검사 로직을 도입해 시작적인 판단 방법으로 차단합니다.

NamuLink 유저스크립트는 애드블록 커뮤니티에 의해 관리되고 있습니다.

설치/이용 과정에서 도움이 필요하시거나 궁금증이 있으시다면 GitHub Discussions를 이용해 주세요.
사용 도중에 해당 유저스크립트가 문제를 발생시킨다고 생각되시면 GitHub Issues를 이용해 주세요.

> [!IMPORTANT]
> NamuLink 유저스크립트 유지보수자는 NamuLink 유저스크립트와 함께 아래 애드블록들 중 하나를 사용하실 것을 권장합니다:
> - AdGuard
> - uBlock Origin
>
> 다른 애드블록 지원은 보장되지 않고 요청되어도 거부될 수 있습니다.

## Discord/Telegram로 업데이트 알림 받기

[Discord 봇](https://discord.com/oauth2/authorize?client_id=1543001264776814723) 또는 Telegram `@filteringdev_noti_bot`을 통해 업데이트 알림을 받을 수 있습니다.

## 설치

### 빠른 시작
아래 URL를 클릭하여 설치해주세요:

https://cdn.jsdelivr.net/npm/@filteringdev/namulink@latest/dist/NamuLink.user.js

### 설치하는 법
Firefox 및 Chromium 기반 브라우저에서는 **Violentmonkey**를, macOS·iOS·iPadOS의 Safari에서는 **wBlock**을 권장합니다. **Tampermonkey는 권장하지 않습니다.**

- [Violentmonkey](https://violentmonkey.github.io/get-it/) (권장) - Firefox 및 Chromium 기반 브라우저 확장
  1. `Dashboard`를 엽니다.
  2. `New` 버튼을 누르십시오.
  3. `Install from URL` 버튼을 누르십시오.
  4. 다음 URL를 누르십시오:
  ```
  https://cdn.jsdelivr.net/npm/@filteringdev/namulink@latest/dist/NamuLink.user.js
  ```
  5. `OK` 버튼을 누르십시오.
  6. 유저스크립트의 메타데이터를 확인하시고 `Confirm installation`를 누르십시오.
  7. 나무위키를 열고 있는 탭으로 돌아가신 뒤에 새로고침하십시오.

- AdGuard for Windows
  1. 빠른 시작 세션에 있는 URL를 클릭하여 설치하십시오.

- AdGuard for Android
  1. 빠른 시작 세션에 있는 URL를 클릭하여 설치하십시오.

- [wBlock](https://apps.apple.com/app/wblock/id6746388723) (권장) - macOS·iOS·iPadOS Safari

  <details>
  <summary>Safari에서 wBlock으로 설치하기</summary>

  1. wBlock 앱을 설치하고 실행한 뒤 초기 설정 안내를 따르십시오.
  2. Safari 확장 프로그램 설정에서 **wBlock Scripts**를 활성화하고 모든 웹 사이트에서 실행할 권한을 허용하십시오.
     - macOS: `Safari` > `설정` > `확장 프로그램`
     - iOS·iPadOS 18 이상: `설정` > `앱` > `Safari` > `확장 프로그램`
     - iOS·iPadOS 17 이하: `설정` > `Safari` > `확장 프로그램`
  3. wBlock 앱의 `Userscripts` 화면에서 추가 메뉴(`+`) > `Userscript` > `URL` > `Single URL`을 선택하십시오.
  4. [빠른 시작 URL](https://cdn.jsdelivr.net/npm/@filteringdev/namulink@latest/dist/NamuLink.user.js)을 입력하고 `Next`를 누르십시오.
  5. 메타데이터를 확인한 뒤 `Add`를 눌러 스크립트를 추가하고 활성화하십시오.
  6. Safari에서 나무위키를 열고 있는 탭으로 돌아가 새로고침하십시오.

  </details>
