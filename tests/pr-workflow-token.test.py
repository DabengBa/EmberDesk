"""Static integration guard for privileged PR automation; no credentials/network."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXPECTED = {
    'pr-auto-manager.yml': {
        'label-by-size': {'pull-requests': 'write'},
        'label-by-branches': {'contents': 'read', 'pull-requests': 'write'},
        'label-by-files': {'contents': 'read', 'pull-requests': 'write'},
        'label-copilot-prs': {'pull-requests': 'write'},
        'remove-stale-label': {'pull-requests': 'write'},
        'check-merge-blocking-labels': {'checks': 'write'},
        'write-auto-comments': {'contents': 'read', 'pull-requests': 'write'},
        'update-linked-issues': {'issues': 'write', 'pull-requests': 'read'},
    },
    'pr-check-merge-conflicts.yaml': {
        'check-merge-conflicts': {'contents': 'read', 'pull-requests': 'write'},
    },
    'on-open-handler.yml': {
        'label-maintainer': {'issues': 'write', 'pull-requests': 'write'},
    },
    'on-close-handler.yml': {
        'remove-labels': {'issues': 'write', 'pull-requests': 'write'},
    },
}


class PrWorkflowTokenTest(unittest.TestCase):
    def test_native_tokens_and_scoped_permissions(self):
        for filename, expected_jobs in EXPECTED.items():
            with self.subTest(workflow=filename):
                text = (ROOT / '.github/workflows' / filename).read_text()
                self.assertNotRegex(text, r'create-github-app-token|ST_BOT_|steps\.app|fallback')
                self.assertIn('permissions: {}\n', text)
                self.assertIn('${{ github.token }}', text)
                jobs = dict(re.findall(r'^  ([\w-]+):\n(.*?)(?=^  [\w-]+:|\Z)',
                                       text.split('\njobs:\n', 1)[1], re.M | re.S))
                self.assertEqual(set(jobs), set(expected_jobs))
                for name, permissions in expected_jobs.items():
                    block = jobs[name]
                    match = re.search(r'^    permissions:\n((?:      [\w-]+: \w+\n)+)', block, re.M)
                    self.assertIsNotNone(match, name)
                    self.assertEqual(dict(re.findall(r'      ([\w-]+): (\w+)', match[1])), permissions)

    def test_no_untrusted_code_in_privileged_jobs(self):
        for filename in EXPECTED:
            text = (ROOT / '.github/workflows' / filename).read_text()

            self.assertNotRegex(text, r'\brun:.*(?:npm|pnpm|node|bash|sh) ')
            for checkout in re.findall(r'uses: actions/checkout@[^\n]+\n(.*?)(?=      - name:|\Z)', text, re.S):
                self.assertNotIn('pull_request.head', checkout)
                self.assertIn('ref: ${{ github.event.repository.default_branch }}', checkout)
                self.assertIn('persist-credentials: false', checkout)


if __name__ == '__main__':
    unittest.main()
