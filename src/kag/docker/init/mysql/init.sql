-- Инициализация базы данных для образовательной доменной области GetcourseAgent
USE openspg_education;

-- Таблица для метаданных схемы
CREATE TABLE IF NOT EXISTS schema_metadata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для правил вывода
CREATE TABLE IF NOT EXISTS reasoning_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_enabled (enabled),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для логирования выводов
CREATE TABLE IF NOT EXISTS inference_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rule_name VARCHAR(255) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    inference_result TEXT,
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rule_name (rule_name),
    INDEX idx_entity_id (entity_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для кеширования запросов
CREATE TABLE IF NOT EXISTS query_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    query_hash VARCHAR(64) NOT NULL UNIQUE,
    query_text TEXT NOT NULL,
    result_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    hit_count INT DEFAULT 0,
    INDEX idx_query_hash (query_hash),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для метрик производительности
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operation_type VARCHAR(100) NOT NULL,
    operation_name VARCHAR(255) NOT NULL,
    duration_ms INT NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_operation_type (operation_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Вставка начальных данных
INSERT INTO schema_metadata (name, version, content) VALUES 
('education-schema', '1.0.0', 'Education domain schema for GetcourseAgent KAG system')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Вставка начальных правил вывода
INSERT INTO reasoning_rules (name, type, content, priority) VALUES 
('StudentReadiness', 'kgdsl', 'Rule for checking student readiness to learn concepts', 10),
('AssignmentDifficulty', 'kgdsl', 'Rule for matching assignment difficulty with student level', 20),
('ConceptPrerequisites', 'kgdsl', 'Rule for validating concept prerequisites', 30)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Создание представления для статистики
CREATE OR REPLACE VIEW inference_statistics AS
SELECT 
    rule_name,
    COUNT(*) as total_inferences,
    AVG(confidence) as avg_confidence,
    DATE(created_at) as inference_date
FROM inference_logs
GROUP BY rule_name, DATE(created_at);

-- Создание представления для производительности
CREATE OR REPLACE VIEW performance_statistics AS
SELECT 
    operation_type,
    operation_name,
    COUNT(*) as total_operations,
    AVG(duration_ms) as avg_duration_ms,
    SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful_operations,
    SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END) as failed_operations,
    DATE(created_at) as operation_date
FROM performance_metrics
GROUP BY operation_type, operation_name, DATE(created_at);

-- Создание процедуры для очистки старых логов
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS cleanup_old_logs(IN days_to_keep INT)
BEGIN
    DELETE FROM inference_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
    DELETE FROM performance_metrics WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
    DELETE FROM query_cache WHERE expires_at IS NOT NULL AND expires_at < NOW();
END //
DELIMITER ;

-- Создание события для автоматической очистки (запускается раз в день)
CREATE EVENT IF NOT EXISTS daily_cleanup
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO CALL cleanup_old_logs(30);

-- Вывод информации об успешной инициализации
SELECT 'MySQL database for OpenSPG Education initialized successfully!' as status;

