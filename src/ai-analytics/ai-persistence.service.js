const prisma = require("../maintenance/prisma");

function normalizeString(value) {
  const s = String(value || "").trim();
  return s || null;
}

function safeJson(value) {
  return value == null ? null : value;
}

async function createConversation({
  companyId,
  userId,
  title = null,
  context = null,
}) {
  return prisma.ai_conversations.create({
    data: {
      company_id: companyId,
      user_id: userId,
      title: normalizeString(title),
      context: normalizeString(context),
      last_message_at: new Date(),
    },
  });
}

async function getConversationById({ companyId, conversationId }) {
  if (!conversationId) return null;

  return prisma.ai_conversations.findFirst({
    where: {
      id: conversationId,
      company_id: companyId,
    },
  });
}

async function getOrCreateConversation({
  companyId,
  userId,
  conversationId = null,
  title = null,
  context = null,
}) {
  if (conversationId) {
    const existing = await getConversationById({
      companyId,
      conversationId,
    });

    if (existing) return existing;
  }

  return createConversation({
    companyId,
    userId,
    title,
    context,
  });
}

async function touchConversation({
  companyId,
  conversationId,
  title,
  context,
}) {
  if (!conversationId) return null;

  const data = {
    last_message_at: new Date(),
  };

  if (title !== undefined) {
    data.title = normalizeString(title);
  }

  if (context !== undefined) {
    data.context = normalizeString(context);
  }

  return prisma.ai_conversations.updateMany({
    where: {
      id: conversationId,
      company_id: companyId,
    },
    data,
  });
}

async function createMessage({
  companyId,
  conversationId,
  userId = null,
  role,
  content,
  parsedMode = null,
  parsedIntent = null,
  parsedJson = null,
  responseJson = null,
}) {
  const message = await prisma.ai_messages.create({
    data: {
      company_id: companyId,
      conversation_id: conversationId,
      user_id: userId,
      role,
      content: String(content || "").trim(),
      parsed_mode: normalizeString(parsedMode),
      parsed_intent: normalizeString(parsedIntent),
      parsed_json: safeJson(parsedJson),
      response_json: safeJson(responseJson),
    },
  });

  await touchConversation({
    companyId,
    conversationId,
  });

  return message;
}

async function createUserMessage({
  companyId,
  conversationId,
  userId,
  content,
  parsed = null,
}) {
  return createMessage({
    companyId,
    conversationId,
    userId,
    role: "USER",
    content,
    parsedMode: parsed?.mode || null,
    parsedIntent: parsed?.intent || null,
    parsedJson: parsed || null,
  });
}

async function createAssistantMessage({
  companyId,
  conversationId,
  content,
  parsed = null,
  responseJson = null,
}) {
  return createMessage({
    companyId,
    conversationId,
    userId: null,
    role: "ASSISTANT",
    content,
    parsedMode: parsed?.mode || null,
    parsedIntent: parsed?.intent || null,
    parsedJson: parsed || null,
    responseJson,
  });
}

async function createSystemMessage({
  companyId,
  conversationId,
  content,
  responseJson = null,
}) {
  return createMessage({
    companyId,
    conversationId,
    userId: null,
    role: "SYSTEM",
    content,
    responseJson,
  });
}

async function createQueryRun({
  companyId,
  conversationId = null,
  messageId = null,
  userId = null,
  question,
  parsedJson = null,
  analyticsQuery = null,
  sessionSnapshot = null,
}) {
  return prisma.ai_query_runs.create({
    data: {
      company_id: companyId,
      conversation_id: conversationId,
      message_id: messageId,
      user_id: userId,
      question: String(question || "").trim(),
      parsed_json: safeJson(parsedJson),
      analytics_query: safeJson(analyticsQuery),
      session_snapshot: safeJson(sessionSnapshot),
      status: "PENDING",
    },
  });
}

async function markQueryRunSuccess({
  companyId,
  runId,
  resultJson = null,
  sessionSnapshot = null,
}) {
  return prisma.ai_query_runs.updateMany({
    where: {
      id: runId,
      company_id: companyId,
    },
    data: {
      status: "SUCCESS",
      result_json: safeJson(resultJson),
      session_snapshot: safeJson(sessionSnapshot),
      finished_at: new Date(),
    },
  });
}

async function markQueryRunFailed({
  companyId,
  runId,
  errorMessage,
  resultJson = null,
}) {
  return prisma.ai_query_runs.updateMany({
    where: {
      id: runId,
      company_id: companyId,
    },
    data: {
      status: "FAILED",
      error_message: normalizeString(errorMessage),
      result_json: safeJson(resultJson),
      finished_at: new Date(),
    },
  });
}

async function createActionRun({
  companyId,
  conversationId = null,
  messageId = null,
  userId = null,
  actionName,
  payloadJson = null,
}) {
  return prisma.ai_action_runs.create({
    data: {
      company_id: companyId,
      conversation_id: conversationId,
      message_id: messageId,
      user_id: userId,
      action_name: String(actionName || "").trim(),
      payload_json: safeJson(payloadJson),
      status: "PENDING",
    },
  });
}

async function markActionRunSuccess({
  companyId,
  runId,
  resultJson = null,
}) {
  return prisma.ai_action_runs.updateMany({
    where: {
      id: runId,
      company_id: companyId,
    },
    data: {
      status: "SUCCESS",
      result_json: safeJson(resultJson),
      executed_at: new Date(),
    },
  });
}

async function markActionRunFailed({
  companyId,
  runId,
  errorMessage,
  resultJson = null,
}) {
  return prisma.ai_action_runs.updateMany({
    where: {
      id: runId,
      company_id: companyId,
    },
    data: {
      status: "FAILED",
      error_message: normalizeString(errorMessage),
      result_json: safeJson(resultJson),
      executed_at: new Date(),
    },
  });
}

async function listConversationMessages({
  companyId,
  conversationId,
  limit = 50,
}) {
  return prisma.ai_messages.findMany({
    where: {
      company_id: companyId,
      conversation_id: conversationId,
    },
    orderBy: {
      created_at: "asc",
    },
    take: Math.max(1, Math.min(Number(limit) || 50, 200)),
  });
}

async function getLatestConversationSnapshot({
  companyId,
  conversationId,
}) {
  const run = await prisma.ai_query_runs.findFirst({
    where: {
      company_id: companyId,
      conversation_id: conversationId,
      status: "SUCCESS",
      session_snapshot: {
        not: null,
      },
    },
    orderBy: {
      created_at: "desc",
    },
    select: {
      session_snapshot: true,
    },
  });

  return run?.session_snapshot || null;
}

module.exports = {
  createConversation,
  getConversationById,
  getOrCreateConversation,
  touchConversation,

  createMessage,
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,

  createQueryRun,
  markQueryRunSuccess,
  markQueryRunFailed,

  createActionRun,
  markActionRunSuccess,
  markActionRunFailed,

  listConversationMessages,
  getLatestConversationSnapshot,
};