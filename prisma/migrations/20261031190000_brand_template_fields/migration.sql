-- AlterTable : champs additifs du template de marque.
-- `payload` porte le Template v2 complet (source de vérité pour le rendu),
-- `brand` la provenance de la charte client, `logo` le logo retenu.
-- Tous nullables : aucune ligne existante n'est invalidée.
ALTER TABLE "Template" ADD COLUMN "payload" JSONB;
ALTER TABLE "Template" ADD COLUMN "brand" JSONB;
ALTER TABLE "Template" ADD COLUMN "logo" JSONB;
