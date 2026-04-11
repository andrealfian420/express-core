function baseTemplate(content) {
  const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${process.env.APP_NAME}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:#4f46e5;padding:24px 40px;">
                  <h1 style="margin:0;color:#ffffff;font-size:22px;">${process.env.APP_NAME}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:16px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;color:#9ca3af;font-size:12px;">
                    This is an automated email, please do not reply.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  return html
}

module.exports = baseTemplate
