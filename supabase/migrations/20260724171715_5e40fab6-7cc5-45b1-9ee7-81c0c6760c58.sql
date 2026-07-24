
ALTER TABLE public.glebas ADD COLUMN IF NOT EXISTS vgv_atribuido numeric;

CREATE OR REPLACE FUNCTION public.enforce_vgv_atribuido_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vgv_atribuido IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Apenas administradores podem definir o VGV atribuído';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.vgv_atribuido IS DISTINCT FROM OLD.vgv_atribuido
       AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.vgv_atribuido := OLD.vgv_atribuido;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vgv_atribuido_admin_only_trg ON public.glebas;
CREATE TRIGGER enforce_vgv_atribuido_admin_only_trg
BEFORE INSERT OR UPDATE ON public.glebas
FOR EACH ROW EXECUTE FUNCTION public.enforce_vgv_atribuido_admin_only();

INSERT INTO public.system_config (key, value, description)
VALUES ('meta_semestre_vgv', '0', 'Meta de VGV (R$) para negócios fechados no semestre')
ON CONFLICT (key) DO NOTHING;
