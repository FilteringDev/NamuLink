## NamuLink

[![jsDelivr Stats](https://data.jsdelivr.com/v1/package/npm/@filteringdev/namulink/badge)](https://www.jsdelivr.com/package/npm/@filteringdev/namulink)

NamuLink 유저스크립트는 나무위키의 고급 난독화 시스템 (커스텀 Base64 인코더/디코더 및 [RC4 스트림 암호화](https://en.wikipedia.org/wiki/RC4))를 역이용하거나 프론트엔드 구성 도중에 구성 함수를 무효화하여 나무위키에 있는 처리하기 복잡하고 직접 로드되는 파워링크를 차단합니다.

NamuLink 유저스크립트는 AdGuard와 애드블록 커뮤니티에 의해 관리되고 있습니다.

설치/이용 과정에서 도움이 필요하시거나 궁금증이 있으시다면 GitHub Discussions를 이용해 주세요.
사용 도중에 해당 유저스크립트가 문제를 발생시킨다고 생각되시면 GitHub Issues를 이용해 주세요.

> [!IMPORTANT]
> NamuLink 유저스크립트 유지보수자는 NamuLink 유저스크립트와 함께 아래 애드블록들 중 하나를 사용하실 것을 권장합니다:
> - AdGuard
> - uBlock Origin
>
> 다른 애드블록 지원은 보장되지 않고 요청되어도 거부될 수 있습니다.

### 빠른 시작
아래 URL를 클릭하여 설치해주세요:

https://cdn.jsdelivr.net/npm/@filteringdev/namulink@latest/dist/NamuLink.user.js

### 설치하는 법
- [Violentmonkey](https://addons.mozilla.org/ko/firefox/addon/violentmonkey/) (AdGuard 프리미엄이 없다면 권장됨) - 브라우저 확장
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

- AdGuard for iOS
  AdGuard for iOS는 현재 유저스크립트를 지원하지 않습니다
  그러나, 미래에 지원될 것입니다.[^1]

  몰론, 지금은 대안을 사용하실 수 있습니다.[^2][^3]

  <details>
  <summary>iOS 유저들을 위한 자세한 설명</summary>

  1. [**Userscripts** 앱](https://apps.apple.com/kr/app/userscripts/id1463298887)을 설치하십시오.
  2. Userscripts 확장을 Safari 설정에서 활성화하십시오:
    * iOS 18 이상: `시스템 설정` => `앱` => `Safari` => `확장 프로그램`
    * iOS 17 이하: `시스템 설정` => `Safari` => `확장 프로그램`
    **Userscripts**을 찾으시고 활성화하신 후 `기타 웹 사이트` 권한을 허용하십시오.
  3. Safari에서 [빠른 시작 세션에 있는 URL](https://cdn.jsdelivr.net/npm/@filteringdev/namulink@latest/dist/NamuLink.user.js)을 클릭하십시오.
  4. Safari의 주소바에 있는 확장 아이콘을 클릭하시고 **Userscripts**을 선택하십시오.
  5. 설치하는 버튼을 누르십시오.
  6. 열린 팝업을 스크롤하신 후에 설치하는 버튼을 누르십시오.
  7. 완료되었습니다.

  </details>

[^1]: https://github.com/AdguardTeam/AdguardForiOS/issues/1542
[^2]: https://github.com/quoid/userscripts
[^3]: https://apps.apple.com/us/app/userscripts/id1463298887
