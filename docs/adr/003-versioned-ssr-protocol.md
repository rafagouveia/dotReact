# ADR-003: Versioned SSR protocol over loopback HTTP

Status: accepted for v1.

The host sends `protocolVersion`, `requestId`, `moduleId`, URL, props, and render
mode. The renderer returns the matching identifiers, HTML, and structured head
elements. A protocol mismatch fails explicitly.

Loopback HTTP is used initially because it is observable, portable, and easy to
exercise in contract tests. The renderer supports a shared development token;
production deployment must additionally prevent public network exposure.

