-- Troc Local : schéma de la base de données
DROP DATABASE IF EXISTS troc_local;
CREATE DATABASE troc_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE troc_local;

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  city          VARCHAR(100) NOT NULL,
  lat           DECIMAL(9,6) NULL,  -- centre de la commune
  lng           DECIMAL(9,6) NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  avg_weight_kg DECIMAL(5,2) NOT NULL DEFAULT 2  -- pour le compteur d'impact
);

CREATE TABLE items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  category_id INT NOT NULL,
  title       VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  item_condition ENUM('neuf','tres_bon','bon','use') NOT NULL DEFAULT 'bon',
  city        VARCHAR(100) NOT NULL,
  status      ENUM('disponible','reserve','donne') NOT NULL DEFAULT 'disponible',
  lat         DECIMAL(9,6) NULL,  -- centre de la commune, jamais l'adresse exacte
  lng         DECIMAL(9,6) NULL,
  given_to_id INT NULL,           -- personne qui a reçu l'objet
  given_at    DATETIME NULL,
  -- Modération par l'IA : « pending » le temps de la vérification, « refused » avec une explication pour l'auteur
  moderation_status ENUM('pending','approved','refused') NOT NULL DEFAULT 'approved',
  moderation_reason VARCHAR(300) NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (given_to_id) REFERENCES users(id)      ON DELETE SET NULL,
  INDEX idx_items_geo (lat, lng),
  INDEX idx_items_moderation (moderation_status),
  INDEX idx_items_city (city),
  INDEX idx_items_status (status),
  FULLTEXT INDEX ft_items_search (title, description)
);

CREATE TABLE item_photos (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  item_id  INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  position TINYINT NOT NULL DEFAULT 0,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE favorites (
  user_id    INT NOT NULL,
  item_id    INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- Une conversation = un objet + l'intéressé + le propriétaire
CREATE TABLE conversations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  item_id    INT NOT NULL,
  buyer_id   INT NOT NULL,
  seller_id  INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conv (item_id, buyer_id),
  FOREIGN KEY (item_id)   REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id       INT NOT NULL,
  content         TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id)       REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_msg_conv (conversation_id, created_at)
);

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

INSERT INTO categories (name, avg_weight_kg) VALUES
  ('Maison', 6), ('Vêtements', 0.8), ('Livres', 2.5), ('Électronique', 2.5),
  ('Jardin', 3), ('Enfants', 1.5), ('Sport', 5), ('Autre', 2);
