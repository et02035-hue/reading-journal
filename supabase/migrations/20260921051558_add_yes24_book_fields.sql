/*
# Add YES24 book metadata columns to books table

## Purpose
YES24 도서 검색 결과에서 가져온 추가 도서 정보(출판사, ISBN13, YES24 상품 링크, 표지 이미지 URL)를
books 테이블에 저장할 수 있도록 컬럼을 추가한다.

## Changes
1. New columns on `books`:
   - `publisher` (text, nullable) — 출판사 이름
   - `isbn13` (text, nullable) — ISBN-13 식별자
   - `yes24_url` (text, nullable) — YES24 상품 상세 페이지 URL
   - `cover_image` (text, nullable) — 이미 존재함 (재사용)

2. Security
   - 기존 RLS 정책("books are open")이 모든 컬럼에 적용되므로 추가 정책 불필요.
   - 모든 신규 컬럼은 nullable이므로 기존 데이터에 영향 없음.

## Notes
   - `cover_image` 컬럼은 기존 마이그레이션에 이미 정의되어 있어 재사용한다.
   - 모든 신규 컬럼은 nullable이므로 기존 데이터나 수동 입력 시 영향이 없다.
   - 데이터 손실 위험이 없는 ADD COLUMN 작업만 수행한다.
*/

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS isbn13 text,
  ADD COLUMN IF NOT EXISTS yes24_url text;
