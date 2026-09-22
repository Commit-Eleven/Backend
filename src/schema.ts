import { pool } from './db'

async function initializeTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS;
    `)

    console.log("[schema] Completed (CREATE TABLE)")
  } catch (error) {
    console.error('[schema] [error] ', error)
  }
}

export { initializeTable }

// 서버 뜰 때 한 번. 컬럼명은 DB 테이블 명세서(user, refresh_token) 기준
export async function ensureAuthTables() {
  await pool.query(`
      CREATE TABLE IF NOT EXISTS \`user\` (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255),
          nickname VARCHAR(30) NOT NULL,
          tag CHAR(4) NOT NULL,
          tier ENUM('normal', 'creator', 'admin') NOT NULL DEFAULT 'normal',
          total_exp INT NOT NULL DEFAULT 0,
          provider ENUM('local', 'google') NOT NULL DEFAULT 'local',
          provider_id VARCHAR(128),
          study_unit_id VARCHAR(64),
          study_language VARCHAR(20) NOT NULL DEFAULT 'python',
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_user_email (email),
          UNIQUE KEY uq_user_tag (tag),
          UNIQUE KEY uq_user_provider (provider, provider_id)
      )
  `)
  await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_token (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NOT NULL,
          token_hash VARCHAR(64) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_refresh_hash (token_hash),
          KEY idx_refresh_user (user_id),
          CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
      )
  `)
}

export type User = {
  id: number
  email: string
  password_hash: string | null
  nickname: string
  tag: string
  tier: "normal" | "creator" | "admin"
  total_exp: number
  provider: "local" | "google"
  provider_id: string | null
}
