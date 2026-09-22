import { pool } from "./db"

async function initializeTable() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS \`user\` (
        id BIGINT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        nickname VARCHAR(30) NOT NULL UNIQUE,
        tier ENUM("normal", "creator", "admin") NOT NULL DEFAULT "normal",
        total_exp INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_user_exp (total_exp DESC)
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS submission (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        problem_id VARCHAR(64) NOT NULL,
        is_correct BOOLEAN NOT NULL,
        answer JSON NULL,
        run_output TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_submission_user_problem_created (user_id, problem_id, created_at),
        INDEX idx_submission_user_correct (user_id, is_correct),
        FOREIGN KEY (user_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS exp_log (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        problem_id VARCHAR(64) NULL,
        amount INT NOT NULL,
        reason ENUM("solve", "bonus", "event") NOT NULL DEFAULT "solve",
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_exp_log_user_problem_reason (user_id, problem_id, reason),
        INDEX idx_exp_log_user_created (user_id, created_at),
        CHECK (amount > 0),
        FOREIGN KEY (user_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS friend (
        id BIGINT NOT NULL AUTO_INCREMENT,
        requester_id BIGINT NOT NULL,
        addressee_id BIGINT NOT NULL,
        status ENUM("pending", "accepted") NOT NULL DEFAULT "pending",
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_friend_requester_addressee (requester_id, addressee_id),
        INDEX idx_friend_addressee_status (addressee_id, status),
        CHECK (requester_id <> addressee_id),
        FOREIGN KEY (requester_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE,
        FOREIGN KEY (addressee_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS study_group (
        id BIGINT NOT NULL AUTO_INCREMENT,
        name VARCHAR(50) NOT NULL,
        description VARCHAR(255) NULL,
        owner_id BIGINT NOT NULL,
        capacity SMALLINT NOT NULL DEFAULT 10,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_study_group_owner (owner_id),
        FOREIGN KEY (owner_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS group_member (
        group_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        role ENUM("owner", "member") NOT NULL DEFAULT "member",
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id),
        INDEX idx_group_member_user (user_id),
        FOREIGN KEY (group_id)
          REFERENCES study_group (id)
          ON DELETE CASCADE,
        FOREIGN KEY (user_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS notification (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        type ENUM(
          "friend_request",
          "friend_accepted",
          "group_invite",
          "group_joined",
          "system"
        ) NOT NULL,
        payload JSON NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_notification_user_read_created (
          user_id,
          is_read,
          created_at
        ),
        FOREIGN KEY (user_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,

    `
      CREATE TABLE IF NOT EXISTS notification_setting (
        user_id BIGINT NOT NULL,
        type ENUM(
          "friend_request",
          "friend_accepted",
          "group_invite",
          "group_joined",
          "system"
        ) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        PRIMARY KEY (user_id, type),
        FOREIGN KEY (user_id)
          REFERENCES \`user\` (id)
          ON DELETE CASCADE
      )
    `,
  ]

  try {
    for (const statement of statements) {
      await pool.query(statement)
    }

    console.log("[schema] Completed (CREATE TABLE)")
  } catch (error) {
    console.error("[schema] [error]", error)
    throw error
  }
}

export { initializeTable }