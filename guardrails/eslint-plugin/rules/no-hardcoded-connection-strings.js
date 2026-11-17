const CONNECTION_URL =
  /\b(mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|mssql|sqlserver|redis|rediss|libsql|cockroachdb|amqps?):\/\/[^\s'"`]+/i;

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never hard-code connection strings (MongoDB, Postgres, etc.); use environment variables for secrets.',
      source: 'AGENTS.md > Security',
    },
    schema: [],
    messages: {
      connection:
        'Found a hard-coded {{scheme}}:// connection string. Why: connection strings carry hosts and credentials; once committed they live in git history and every clone, and in src/ they ship to every browser. ' +
        'Fix: delete it. The template backend is SQLite only (path in backend/config.json "database.connectionString"); secrets go in backend/.env, read by backend/src/config.rs. Node scripts read `process.env.NAME` and fail loudly when it is missing.',
    },
  },
  create(context) {
    function check(node, text) {
      const match = CONNECTION_URL.exec(text);
      if (match) context.report({ node, messageId: 'connection', data: { scheme: match[1].toLowerCase() } });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateLiteral(node) {
        check(node, node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('${}'));
      },
    };
  },
};
