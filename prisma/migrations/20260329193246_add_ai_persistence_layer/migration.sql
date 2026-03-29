-- CreateEnum
CREATE TYPE "ai_conversation_status" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ai_run_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "context" TEXT,
    "status" "ai_conversation_status" NOT NULL DEFAULT 'ACTIVE',
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID,
    "role" "ai_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "parsed_mode" TEXT,
    "parsed_intent" TEXT,
    "parsed_json" JSONB,
    "response_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_query_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "user_id" UUID,
    "question" TEXT NOT NULL,
    "parsed_json" JSONB,
    "analytics_query" JSONB,
    "result_json" JSONB,
    "session_snapshot" JSONB,
    "status" "ai_run_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_query_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_action_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "conversation_id" UUID,
    "message_id" UUID,
    "user_id" UUID,
    "action_name" TEXT NOT NULL,
    "payload_json" JSONB,
    "result_json" JSONB,
    "status" "ai_run_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_action_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_conversations_company_id" ON "ai_conversations"("company_id");

-- CreateIndex
CREATE INDEX "idx_ai_conversations_user_id" ON "ai_conversations"("user_id");

-- CreateIndex
CREATE INDEX "idx_ai_conversations_status" ON "ai_conversations"("status");

-- CreateIndex
CREATE INDEX "idx_ai_conversations_last_message_at" ON "ai_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "idx_ai_messages_company_id" ON "ai_messages"("company_id");

-- CreateIndex
CREATE INDEX "idx_ai_messages_conversation_id" ON "ai_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_ai_messages_user_id" ON "ai_messages"("user_id");

-- CreateIndex
CREATE INDEX "idx_ai_messages_role" ON "ai_messages"("role");

-- CreateIndex
CREATE INDEX "idx_ai_messages_created_at" ON "ai_messages"("created_at");

-- CreateIndex
CREATE INDEX "idx_ai_query_runs_company_id" ON "ai_query_runs"("company_id");

-- CreateIndex
CREATE INDEX "idx_ai_query_runs_conversation_id" ON "ai_query_runs"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_ai_query_runs_message_id" ON "ai_query_runs"("message_id");

-- CreateIndex
CREATE INDEX "idx_ai_query_runs_user_id" ON "ai_query_runs"("user_id");

-- CreateIndex
CREATE INDEX "idx_ai_query_runs_status" ON "ai_query_runs"("status");

-- CreateIndex
CREATE INDEX "idx_ai_query_runs_created_at" ON "ai_query_runs"("created_at");

-- CreateIndex
CREATE INDEX "idx_ai_action_runs_company_id" ON "ai_action_runs"("company_id");

-- CreateIndex
CREATE INDEX "idx_ai_action_runs_conversation_id" ON "ai_action_runs"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_ai_action_runs_message_id" ON "ai_action_runs"("message_id");

-- CreateIndex
CREATE INDEX "idx_ai_action_runs_user_id" ON "ai_action_runs"("user_id");

-- CreateIndex
CREATE INDEX "idx_ai_action_runs_status" ON "ai_action_runs"("status");

-- CreateIndex
CREATE INDEX "idx_ai_action_runs_created_at" ON "ai_action_runs"("created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_query_runs" ADD CONSTRAINT "ai_query_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_query_runs" ADD CONSTRAINT "ai_query_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_query_runs" ADD CONSTRAINT "ai_query_runs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_query_runs" ADD CONSTRAINT "ai_query_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_runs" ADD CONSTRAINT "ai_action_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_runs" ADD CONSTRAINT "ai_action_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_runs" ADD CONSTRAINT "ai_action_runs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_action_runs" ADD CONSTRAINT "ai_action_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
