-- Troc Local V2 : carte, profils, avis et impact
-- À appliquer sur une base créée avec l'ancien schema.sql :
--   mysql -u root -p troc_local < sql/migration-v2.sql
USE troc_local;

-- Coordonnées (centre de la commune, jamais l'adresse exacte)
ALTER TABLE users
  ADD COLUMN lat DECIMAL(9,6) NULL,
  ADD COLUMN lng DECIMAL(9,6) NULL;

ALTER TABLE items
  ADD COLUMN lat DECIMAL(9,6) NULL,
  ADD COLUMN lng DECIMAL(9,6) NULL,
  ADD COLUMN given_to_id INT NULL,
  ADD COLUMN given_at DATETIME NULL,
  ADD CONSTRAINT fk_items_given_to FOREIGN KEY (given_to_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX idx_items_geo (lat, lng);

-- Poids moyen estimé par catégorie, pour le compteur d'impact
ALTER TABLE categories ADD COLUMN avg_weight_kg DECIMAL(5,2) NOT NULL DEFAULT 2;
UPDATE categories SET avg_weight_kg = CASE name
  WHEN 'Maison' THEN 6 WHEN 'Vêtements' THEN 0.8 WHEN 'Livres' THEN 2.5
  WHEN 'Électronique' THEN 2.5 WHEN 'Jardin' THEN 3 WHEN 'Enfants' THEN 1.5
  WHEN 'Sport' THEN 5 ELSE 2 END;

-- Avis laissés après un don : le donneur et le receveur peuvent se noter mutuellement
CREATE TABLE reviews (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  item_id     INT NOT NULL,
  reviewer_id INT NOT NULL,
  reviewee_id INT NOT NULL,
  rating      TINYINT NOT NULL,
  comment     VARCHAR(500) NOT NULL DEFAULT '',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review (item_id, reviewer_id),
  CHECK (rating BETWEEN 1 AND 5),
  FOREIGN KEY (item_id)     REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reviews_reviewee (reviewee_id)
);
