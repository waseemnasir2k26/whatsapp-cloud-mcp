import type { Config } from "./config.js";

export class GraphError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Graph API error ${status}`);
  }
}

export class GraphClient {
  constructor(
    private cfg: Config,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private url(path: string) {
    return `${this.cfg.graphBaseUrl}/${this.cfg.graphVersion}/${path}`;
  }

  messagesUrl() {
    return this.url(`${this.cfg.phoneNumberId}/messages`);
  }

  async request(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
  ): Promise<any> {
    const res = await this.fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) throw new GraphError(res.status, json);
    return json;
  }

  buildTemplatePayload(
    to: string,
    name: string,
    lang: string,
    params: string[],
  ) {
    const template: any = { name, language: { code: lang } };
    if (params.length) {
      template.components = [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ];
    }
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template,
    };
  }

  buildTextPayload(to: string, body: string) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    };
  }

  send(payload: unknown) {
    return this.request("POST", this.messagesUrl(), payload);
  }

  listTemplates() {
    return this.request(
      "GET",
      this.url(
        `${this.cfg.wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
      ),
    );
  }

  getTemplate(name: string) {
    return this.request(
      "GET",
      this.url(
        `${this.cfg.wabaId}/message_templates?fields=name,status,category,language,components&name=${encodeURIComponent(name)}`,
      ),
    );
  }
}
