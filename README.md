# EduTranscribe Backend

Backend service for EduTranscribe, built with **Fastify**, **TypeScript**, **Better-Auth**, **Drizzle ORM**, **Neon PostgreSQL**, and **Zod**.

---

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Fastify v5](https://fastify.dev/)
- **Authentication**: [Better-Auth](https://www.better-auth.com/)
- **Database ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Database Driver**: [@neondatabase/serverless](https://neon.tech/) (PostgreSQL)

---

## 🚀 Getting Started

### 1. Prerequisites

Make sure you have [Bun](https://bun.sh/) installed on your machine.

```bash
bun --version
```

### 2. Environment Variables

Create a `.env` file in the root directory and add your environment variables:

```env
DATABASE_URL=postgresql://user:password@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
BETTER_AUTH_SECRET=your_better_auth_secret_here
BETTER_AUTH_URL=http://localhost:3000
```

### 3. Install Dependencies

```bash
bun install
```

### 4. Database Migrations / Schema Sync

Generate and push database schema changes using Drizzle Kit:

```bash
# Push schema to database
bunx drizzle-kit push
```

### 5. Running the Application

```bash
# Development mode (auto-reload on change)
bun dev

# Production mode
bun run index.ts
```

The server will start at `http://localhost:3000`.

---

## 📡 API Reference & Route Documentation

### 1. Health Check

#### 1.1 Health Check
- **Endpoint**: `GET /api/health`
- **Response** (200 OK):
  ```json
  {
    "status": "ok",
    "timestamp": "2026-08-31"
  }
  ```

---

### 2. Authentication Routes (`/api/auth/*`)

Handled automatically by **Better-Auth**. The `role` field (`"educator"` | `"student"`) is supported on sign-up.

#### 2.1 Sign Up with Email
- **Endpoint**: `POST /api/auth/sign-up/email`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "securePassword123",
    "role": "educator"
  }
  ```
  *(Note: `role` is optional and defaults to `"student"` if omitted)*
- **Response** (200 OK):
  ```json
  {
    "user": {
      "id": "usr_12345",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "educator",
      "emailVerified": false,
      "createdAt": "2026-08-29T17:00:00.000Z",
      "updatedAt": "2026-08-29T17:00:00.000Z"
    },
    "session": {
      "id": "sess_12345",
      "userId": "usr_12345",
      "expiresAt": "2026-09-05T17:00:00.000Z",
      "token": "..."
    }
  }
  ```

#### 2.2 Sign In with Email
- **Endpoint**: `POST /api/auth/sign-in/email`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "securePassword123"
  }
  ```
- **Response** (200 OK): Returns user details and session token / sets auth cookies.

#### 2.3 Get Current Session
- **Endpoint**: `GET /api/auth/get-session`
- **Headers**: `Cookie` or `Authorization` header containing session token.
- **Response** (200 OK): Returns active session and logged-in user object.

#### 2.4 Sign Out
- **Endpoint**: `POST /api/auth/sign-out`
- **Response** (200 OK): Invalidates current session and clears authentication cookies.

---

### 3. Subject Routes (`/api/subjects`)

#### 3.1 Get All Subjects (Paginated)
- **Endpoint**: `GET /api/subjects`
- **Auth**: None
- **Request Body**:
  ```json
  {
    "page": 1,
    "limit": 10
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Mathematics",
        "slug": "/Mathematics"
      }
    ]
  }
  ```
- **Response** (200 OK — empty):
  ```json
  {
    "success": false,
    "message": "No subjects exist. Create one",
    "data": null
  }
  ```

#### 3.2 Create a Subject
- **Endpoint**: `POST /api/subjects/new`
- **Auth**: Educator only (`authenticate` + `authorize("educator")`)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Physics",
    "userId": "usr_12345"
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Physics",
    "slug": "/Physics"
  }
  ```

#### 3.3 Search Subjects
- **Endpoint**: `GET /api/subjects/search`
- **Auth**: None
- **Query Parameters**:
  - `name` *(string, required)*: Subject name to search for (exact match).
- **Example**: `GET /api/subjects/search?name=Math`
- **Response** (200 OK): Returns array of matching subjects.

---

### 4. Lesson Routes (`/api/lessons`)

#### 4.1 Get All Lessons (Paginated)
- **Endpoint**: `GET /api/lessons`
- **Auth**: Any authenticated user (`authenticate`)
- **Request Body**:
  ```json
  {
    "page": 1,
    "limit": 10,
    "subjectId": "optional-uuid",
    "status": "processing"
  }
  ```
  *(Note: `subjectId` and `status` are optional filters. `status` can be `"processing"`, `"ready"`, or `"failed"`)*
- **Response** (200 OK):
  ```json
  {
    "lessons": {
      "lessons": [
        {
          "id": "uuid",
          "title": "Introduction to Algebra",
          "subjectName": "Mathematics",
          "educatorName": "Jane Doe",
          "status": "processing",
          "totalPages": 0,
          "createdAt": "2026-08-31T12:00:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 42
      }
    }
  }
  ```

#### 4.2 Create a Lesson
- **Endpoint**: `POST /api/lessons/new`
- **Auth**: Educator only (`authenticate` + `authorize("educator")`)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "title": "Introduction to Algebra",
    "subjectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "educatorId": "usr_12345"
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "newLesson": {
      "id": "uuid",
      "title": "Introduction to Algebra",
      "subjectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "educatorId": "usr_12345",
      "status": "processing",
      "totalPages": 0,
      "processedPages": 0,
      "pdfUrl": null,
      "createdAt": "2026-08-31T12:00:00.000Z"
    }
  }
  ```

#### 4.3 Get Lesson by ID
- **Endpoint**: `GET /api/lessons/:id`
- **Auth**: Any authenticated user (`authenticate`)
- **Response** (200 OK):
  ```json
  {
    "lessons": [
      {
        "id": "uuid",
        "title": "Introduction to Algebra",
        "subjectId": "...",
        "educatorId": "...",
        "status": "processing",
        "totalPages": 0,
        "processedPages": 0,
        "pdfUrl": null,
        "createdAt": "2026-08-31T12:00:00.000Z"
      }
    ]
  }
  ```

---

## 📁 Project Structure

```
├── index.ts               # Main server entry point
├── drizzle.config.ts      # Drizzle ORM configuration
├── package.json           # Package metadata and scripts
├── src
│   ├── config
│   │   └── db             # Database client connection
│   ├── controllers        # Request handlers & logic
│   ├── lib                # Better-Auth initialization & setup
│   ├── plugins            # Fastify plugins (auth decorators)
│   ├── models             # Drizzle PostgreSQL tables & schema
│   ├── routes             # API route declarations
│   ├── services           # Business logic & DB queries
│   └── types              # TypeScript type definitions
```
