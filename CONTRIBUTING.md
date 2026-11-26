# How to contribute to EmberDesk

## Getting the code ready

1. Fork this repository and clone your fork.
2. Create a branch, make your changes, and test them locally.
3. Commit, push, and open a pull request targeting the correct upstream branch.

## Contribution guidelines

- Run `pnpm run lint` and fix its findings before submitting. Follow the code and tests already present; a linter is authoritative for mechanical style.
- Create pull requests for the `staging` branch; 99% of contributions should go there so people can test before the next stable release. Target `release` only for README updates, GitHub Actions, or critical-bug hotfixes.
- Enable "Allow edits from maintainers". Avoid force-pushing once the PR is out of draft state. Maintainers may test and change code before merging.
- Keep contributions small and testable. The soft limit is **200 lines of code** (additions and deletions) per PR; split larger work into reviewable PRs. Discuss substantial feature branches with maintainers first; do not create all branches in advance.
- Write meaningful PR descriptions and commit messages: state the reason, the change, and how a reviewer can test it.
- English is the primary language for commit messages, PR descriptions, comments and other text, except localization files.
- Mind the license. Your contributions are licensed under the GNU Affero General Public License.

## Use of AI coding assistance tools

AI tools are neither prohibited nor encouraged. You are responsible for everything submitted: review and test it, and be ready to discuss and fix review issues. Maintainers may reject very low-quality PRs when fixing them costs more than rewriting them. Avoid unrelated comments, excessive logging, and changes that ignore project context. Feedback from maintainer-provided AI tools is not a call to action; assess it before applying.
