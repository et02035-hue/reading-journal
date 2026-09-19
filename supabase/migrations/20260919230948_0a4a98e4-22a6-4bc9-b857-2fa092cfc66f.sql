CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  total_pages integer NOT NULL DEFAULT 0 CHECK (total_pages >= 0),
  current_page integer NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  genre text,
  cover_image text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reading_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  read_date date NOT NULL DEFAULT CURRENT_DATE,
  start_page integer NOT NULL CHECK (start_page >= 0),
  end_page integer NOT NULL CHECK (end_page >= 0),
  pages_read integer GENERATED ALWAYS AS (end_page - start_page + 1) STORED,
  quote text,
  thought text,
  page_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reading_logs_page_range CHECK (end_page >= start_page)
);

CREATE INDEX reading_logs_read_date_idx ON public.reading_logs (read_date DESC);
CREATE INDEX reading_logs_book_id_idx ON public.reading_logs (book_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO anon, authenticated;
GRANT ALL ON public.books TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_logs TO anon, authenticated;
GRANT ALL ON public.reading_logs TO service_role;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "books are open" ON public.books FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "reading logs are open" ON public.reading_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER books_set_updated_at BEFORE UPDATE ON public.books
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_book_progress()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  target_book uuid;
  max_page integer;
BEGIN
  target_book := COALESCE(NEW.book_id, OLD.book_id);
  SELECT COALESCE(MAX(end_page), 0) INTO max_page
  FROM public.reading_logs WHERE book_id = target_book;

  UPDATE public.books b
  SET current_page = GREATEST(max_page, 0),
      completed = (b.total_pages > 0 AND max_page >= b.total_pages)
  WHERE b.id = target_book;

  RETURN NULL;
END;
$$;

CREATE TRIGGER reading_logs_sync_progress
AFTER INSERT OR UPDATE OR DELETE ON public.reading_logs
FOR EACH ROW EXECUTE FUNCTION public.sync_book_progress();