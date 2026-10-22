# Security policy

Lumière controls physical machines that can start fires and cause eye injuries. We treat both
software vulnerabilities and **unsafe machine behaviour** as security issues.

## What to report

- Software vulnerabilities: code execution through a crafted project/SVG/DXF/HPGL file, path
  traversal when saving files, unsafe handling of network connections, etc.
- Unsafe behaviour: the laser firing during travel moves, failing to stop after *Arrêter*,
  ignoring a pause, wrong power scaling, jobs resuming unexpectedly after a reconnection.

## How to report

Please **do not open a public issue** for vulnerabilities. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" in the repository's *Security* tab).

Include the Lumière version, your OS, the controller and firmware, steps to reproduce and any
files needed. You should receive an acknowledgement within a week.

Unsafe machine behaviour that is not exploitable by a third party can be reported as a regular
issue with the *Bug report* template, marked **[safety]** in the title.

## Supported versions

Lumière is alpha software: only the latest version on `main` receives fixes.

## Safety reminder

Lumière is provided without warranty (see the [license](LICENSE)). Always supervise a running
laser, wear eye protection rated for your laser's wavelength, keep a fire extinguisher nearby
and make sure your machine has a working emergency stop.
