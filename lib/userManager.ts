import bcrypt from 'bcryptjs';
import { getDatabase } from './database';

interface User {
  username: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export class UserManager {
  getUser(username: string): User | null {
    const row = getDatabase().prepare('SELECT * FROM users WHERE username = ?').get(username);
    return row ? { username: String(row.username), passwordHash: String(row.passwordHash), role: String(row.role), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) } : null;
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const user = this.getUser(username);
    return user ? bcrypt.compare(password, user.passwordHash) : false;
  }

  async updatePassword(username: string, newPassword: string): Promise<boolean> {
    const hash = await bcrypt.hash(newPassword, 10);
    return getDatabase().prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE username = ?')
      .run(hash, new Date().toISOString(), username).changes > 0;
  }

  async createUser(username: string, password: string, role = 'user'): Promise<boolean> {
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    return getDatabase().prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)').run(username, hash, role, now, now).changes > 0;
  }

  deleteUser(username: string): boolean {
    return getDatabase().prepare('DELETE FROM users WHERE username = ?').run(username).changes > 0;
  }

  getAllUsers(): Omit<User, 'passwordHash'>[] {
    return getDatabase().prepare('SELECT username, role, createdAt, updatedAt FROM users ORDER BY username').all()
      .map(row => ({ username: String(row.username), role: String(row.role), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }));
  }
}

export const userManager = new UserManager();
