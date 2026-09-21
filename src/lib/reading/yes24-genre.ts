/**
 * YES24 카테고리 → 앱 장르 매핑.
 * YES24의 다양한 카테고리명을 앱의 7개 장르로 변환한다.
 * 매핑이 애매하면 '기타'로 설정하고 사용자가 직접 수정할 수 있게 한다.
 */

const GENRE_KEYWORDS: Record<string, string[]> = {
  소설: ["소설", "장편", "단편", "패러디", "추리", "미스터리", "판타지", "SF", "로맨스", "무협", "코미디", "그래픽노블", "만화"],
  에세이: ["에세이", "에세이/", "산문", "기행", "여행", "일상", "인물", "신산문"],
  인문: ["인문", "철학", "사상", "종교", "심리", "사회학", "정치", "경제", "교양", "사회과학"],
  과학: ["과학", "수학", "물리", "화학", "생물", "의학", "공학", "컴퓨터", "IT", "기술"],
  자기계발: ["자기계발", "자기관리", "성공", "리더십", "동기부여", "습관", "시간관리", "인간관계", "커뮤니케이션", "직장", "경영", "재테크", "투자", "부자"],
  역사: ["역사", "한국사", "세계사", "고대사", "중세사", "근현대사", "전쟁", "문명"],
};

const APP_GENRES = ["소설", "에세이", "인문", "과학", "자기계발", "역사", "기타"] as const;

/**
 * YES24 카테고리 문자열을 앱 장르로 매핑한다.
 * @param category YES24에서 제공하는 카테고리 경로 (예: "국내도서 > 소설 > 한국소설")
 * @returns 앱의 장르 문자열 ("소설" | "에세이" | "인문" | "과학" | "자기계발" | "역사" | "기타")
 */
export function mapYes24CategoryToGenre(category?: string): string {
  if (!category) return "기타";

  const lower = category.toLowerCase();

  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return genre;
    }
  }

  return "기타";
}

/** 앱에서 사용하는 장르 옵션 목록 (UI 셀렉트용) */
export const APP_GENRE_OPTIONS = APP_GENRES;
