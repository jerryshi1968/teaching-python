CREATE TABLE IF NOT EXISTS python_distributions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  teacher_user_id INT NOT NULL,
  source_project_id CHAR(36) NOT NULL,
  class_id INT NOT NULL,
  request_id CHAR(36) NOT NULL,
  recipient_user_id INT NOT NULL,
  copied_project_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_python_distribution(teacher_user_id, request_id, recipient_user_id),
  CONSTRAINT fk_python_distribution_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_distribution_source FOREIGN KEY (source_project_id) REFERENCES python_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_python_distribution_copy FOREIGN KEY (copied_project_id) REFERENCES python_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
