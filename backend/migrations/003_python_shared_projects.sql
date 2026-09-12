CREATE TABLE python_documents (
  project_id VARCHAR(36) NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  source MEDIUMTEXT NOT NULL,
  stdin MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_python_document_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE python_runs DROP FOREIGN KEY fk_python_run_project;
ALTER TABLE python_distributions DROP FOREIGN KEY fk_python_distribution_source;
ALTER TABLE python_distributions DROP FOREIGN KEY fk_python_distribution_copy;

DROP TABLE python_projects;
DROP TABLE python_project_groups;

ALTER TABLE python_runs ADD CONSTRAINT fk_python_run_shared_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE python_distributions ADD CONSTRAINT fk_python_distribution_shared_source FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE python_distributions ADD CONSTRAINT fk_python_distribution_shared_copy FOREIGN KEY (copied_project_id) REFERENCES projects(id) ON DELETE CASCADE;