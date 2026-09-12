CREATE TABLE python_schema_migrations (
  id VARCHAR(64) PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL,
  completed_statements INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE python_project_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  parent_id BIGINT UNSIGNED DEFAULT NULL,
  sort_order BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_python_groups_user_parent(user_id, parent_id, sort_order),
  CONSTRAINT fk_python_group_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_group_parent FOREIGN KEY (parent_id) REFERENCES python_project_groups(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE python_projects (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  parent_id BIGINT UNSIGNED DEFAULT NULL,
  sort_order BIGINT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  source MEDIUMTEXT NOT NULL,
  stdin MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_python_projects_user_parent(user_id, parent_id, sort_order),
  CONSTRAINT fk_python_project_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_project_parent FOREIGN KEY (parent_id) REFERENCES python_project_groups(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE python_runs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  project_id CHAR(36) NOT NULL,
  request_id CHAR(36) DEFAULT NULL,
  version INT UNSIGNED NOT NULL,
  source MEDIUMTEXT NOT NULL,
  stdin MEDIUMTEXT NOT NULL,
  status VARCHAR(24) NOT NULL,
  stdout MEDIUMTEXT NOT NULL,
  stderr MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) DEFAULT NULL,
  UNIQUE KEY uk_python_run_request(user_id, request_id),
  INDEX idx_python_runs_project_time(project_id, created_at),
  CONSTRAINT fk_python_run_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_run_project FOREIGN KEY (project_id) REFERENCES python_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
