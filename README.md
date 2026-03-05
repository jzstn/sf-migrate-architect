# 🚀 Salesforce Migration Architect CLI

A professional, metadata-driven CLI designed to bridge the gap for **non-mature Salesforce teams** and **Executives**.

---

## ⚡ Easy Install (For New Users)

If you just received this folder, run this single command to install the CLI globally:

```bash
chmod +x setup.sh && ./setup.sh
```

**That's it!** You can now run the tool from any directory using:
`sf-migrate <command>`

---

## 🛠️ Commands

| Command | Purpose |
| :--- | :--- |
| `sf-migrate demo` | **Start Here**. See a sample analysis and AI prompt without logging in. |
| `sf-migrate plan` | Analyze your Org and generate an Executive Flight Plan. |
| `sf-migrate inspect <Object>` | Deep-dive into an object to find Mandatory Fields & External IDs. |
| `sf-migrate bundle` | Generate a single copy-paste block for ChatGPT/Claude. |

---

## 🤖 The "AI Architect" Workflow

1.  **Analyze**: Run `sf-migrate plan` to get your loading order.
2.  **Copy**: Copy the **AI ARCHITECT READY** block from the terminal.
3.  **Paste**: Send it to ChatGPT/Claude to get:
    -   Mermaid.js Sequence Diagrams.
    -   Technical Risk Audits.
    -   Detailed Execution Tables.
    -   MuleSoft/ETL Mapping Strategies.

---

## 🔐 Security
- Rename `.env.template` to `.env` to store your credentials safely.
- Never commit your `.env` file to version control.
- Remember: Your password should be `Password + SecurityToken`.

---
Built for Architects. Simplified for Teams.
