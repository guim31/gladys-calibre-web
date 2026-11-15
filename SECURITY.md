# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores in `/data` only the id of the last Calibre book it has
seen (the cursor of the "New book added" event). The Calibre-Web password is
kept by Gladys in the configuration of the integration; it travels only in the
HTTP Basic Authorization header of the requests to the configured server, and
is never logged nor shown in a status or an error. The integration only reads
the OPDS catalog of Calibre-Web (and the covers), over the address the user
configures, on the local network or behind a reverse proxy: plain HTTP sends
the password in clear on that network. No other host is contacted.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Calibre-Web, Calibre-Web Automated and Calibre themselves.
