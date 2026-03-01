ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS total_bill NUMERIC(10,2);
