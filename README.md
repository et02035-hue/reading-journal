# Reading Journal

한국어 모바일 우선 PWA 웹앱 **「읽는 하루」**를 만들어줘.

목표: 아이폰에서 앱처럼 사용하는 개인 독서 기록 앱. 사용자는 매일 책 페이지 사진을 찍고, 책을 선택하고, 시작/끝 페이지와 인상 깊은 문장/오늘의 생각을 입력해 저장한다.

디자인:
- 아주 깔끔하고 따뜻한 독서 노트 느낌
- 아이보리/오프화이트 배경, 차분한 세이지 그린 포인트
- iPhone 화면 폭 기준 모바일 우선, safe-area 대응
- 큰 터치 영역, 둥근 카드, 과한 장식 금지
- 앱 이름은 「읽는 하루」, 서브카피는 「오늘도 한 페이지」

화면:
1) 홈: 오늘 읽은 쪽수, 최근 기록, 기록하기 버튼
2) 기록하기: 카메라/사진 선택, 책 선택/책 추가, 시작 페이지, 끝 페이지, 인상 깊은 문장, 오늘의 생각, 저장
3) 내 책: 책 목록, 저자, 전체 페이지, 현재 페이지, 진행률, 완독 여부
4) 기록 모아보기: 날짜별 기록과 사진 갤러리
5) 간단 통계: 이번 달 읽은 쪽수, 독서일 수, 완독 책 수

데이터 모델:
- books: id, title, author, total_pages, current_page, genre, cover_image, completed
- reading_logs: id, book_id, read_date, start_page, end_page, pages_read, quote, thought, page_image_url, created_at
- pages_read는 end_page-start_page+1로 자동 계산
- 책 진행률은 current_page/total_pages*100으로 자동 계산

중요:
- 우선 앱 자체가 실제로 작동하도록 만들어줘.
- 사진 업로드는 모바일 카메라/사진 보관함을 모두 지원.
- 새 책 등록 후 기록 화면에서 바로 선택 가능.
- 입력값 검증과 빈 상태 화면을 넣어줘.
- PWA manifest와 모바일 홈 화면 설치에 필요한 설정도 포함.
- 데이터 저장은 프로젝트의 Supabase/PostgreSQL을 사용해 새로고침해도 유지되게 해줘.
- 나중에 Notion DB와 연동할 수 있도록 데이터 구조와 코드 구조를 깔끔하게 분리해줘.
- 현재 연결된 Notion의 「읽는 하루 — 독서 기록」 DB의 필드와 호환되도록 설계해줘.
- 실제 서비스처럼 완성도 있게 구현하고, 데모용 가짜 데이터에 의존하지 마.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eb945fcb-5302-44cc-9980-4c2adb0da181).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
