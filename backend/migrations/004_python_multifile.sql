-- Python 项目仍处于测试阶段；本迁移只清空 Python 类型项目，不触碰其他教学工具的数据。
DELETE f FROM files f JOIN projects p ON p.id = f.project_id WHERE p.project_type = 'python';
DELETE FROM projects WHERE project_type = 'python';

DROP TABLE python_distributions;
DROP TABLE python_runs;
DROP TABLE python_documents;

CREATE TABLE python_documents (
  project_id VARCHAR(36) NOT NULL PRIMARY KEY,
  revision_id CHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_python_document_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE python_revisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  user_id INT NOT NULL,
  source_bytes INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_python_revisions_user_time(user_id, created_at),
  INDEX idx_python_revisions_project_time(project_id, created_at),
  CONSTRAINT fk_python_revision_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_revision_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE python_runs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  project_id VARCHAR(36) NOT NULL,
  request_id CHAR(36) DEFAULT NULL,
  revision_id CHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL,
  stdout MEDIUMTEXT NOT NULL,
  stderr MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) DEFAULT NULL,
  UNIQUE KEY uk_python_run_request(user_id, request_id),
  INDEX idx_python_runs_project_time(project_id, created_at),
  INDEX idx_python_runs_revision(revision_id),
  CONSTRAINT fk_python_run_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_run_shared_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE python_distributions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  teacher_user_id INT NOT NULL,
  source_project_id VARCHAR(36) NOT NULL,
  class_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  recipient_user_id INT NOT NULL,
  copied_project_id VARCHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_python_distribution(teacher_user_id, request_id, recipient_user_id),
  CONSTRAINT fk_python_distribution_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_distribution_source FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_distribution_copy FOREIGN KEY (copied_project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
