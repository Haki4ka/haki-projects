// Fast line scanner for Adblock-style filter lists.
// Cross-checks the Python analyzer with a compiled, streaming implementation.
// Build (with WinLibs/MinGW on PATH):
//   g++ -O2 -std=c++17 -Wall -Wextra -pedantic scan_rules.cpp -o scan_rules.exe
// Run:
//   scan_rules.exe easylist.txt

#include <algorithm>
#include <cctype>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_set>

namespace {

struct Counts {
    std::size_t lines = 0;
    std::size_t comments = 0;
    std::size_t cosmetic = 0;
    std::size_t exceptions = 0;
    std::size_t host_anchor = 0;
    std::size_t other = 0;
};

std::string trim(const std::string& s) {
    const auto first = s.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return {};
    const auto last = s.find_last_not_of(" \t\r\n");
    return s.substr(first, last - first + 1);
}

bool all_domain_chars(const std::string& s) {
    if (s.empty()) return false;
    for (unsigned char c : s) {
        if (!(std::isalnum(c) || c == '-' || c == '.')) return false;
    }
    return true;
}

const std::unordered_set<std::string> SHARED_BASES = {
    "cloudfront.net", "amazonaws.com", "workers.dev", "pages.dev",
    "b-cdn.net", "cdn77.org", "akamaized.net", "azureedge.net",
    "cloudflare.com", "fastly.net", "jsdelivr.net", "unpkg.com",
    "github.io", "netlify.app", "vercel.app", "herokuapp.com",
    "googleapis.com", "gstatic.com",
};

const std::unordered_set<std::string> PUBLIC_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
    "co.nz", "com.br", "com.tr", "com.ua", "com.pl", "com.cn", "com.hk",
    "co.jp", "co.in", "co.kr", "com.sg", "com.mx", "com.ar", "co.za",
};

bool safe_domain(const std::string& domain) {
    if (!all_domain_chars(domain) || domain.find("..") != std::string::npos) {
        return false;
    }
    if (domain.front() == '.' || domain.back() == '.') return false;
    if (SHARED_BASES.count(domain) > 0 || PUBLIC_SUFFIXES.count(domain) > 0) {
        return false;
    }
    std::size_t start = 0;
    while (start < domain.size()) {
        const auto end = domain.find('.', start);
        const std::string label =
            domain.substr(start, end == std::string::npos ? std::string::npos
                                                          : end - start);
        if (label.empty() || label.front() == '-' || label.back() == '-') {
            return false;
        }
        if (end == std::string::npos) break;
        start = end + 1;
    }
    const auto dot = domain.rfind('.');
    if (dot == std::string::npos || dot == 0) return false;
    const std::string tld = domain.substr(dot + 1);
    return tld.size() >= 2 && !std::isdigit(static_cast<unsigned char>(tld[0]));
}

}  // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "Usage: scan_rules <filter-list.txt>\n";
        return 2;
    }

    std::ifstream input(argv[1]);
    if (!input) {
        std::cerr << "Cannot open: " << argv[1] << '\n';
        return 1;
    }

    Counts counts;
    std::unordered_set<std::string> domains;
    std::string line;

    while (std::getline(input, line)) {
        ++counts.lines;
        const std::string s = trim(line);
        if (s.empty()) continue;
        if (s[0] == '!') {
            ++counts.comments;
            continue;
        }
        if (s.find("##") != std::string::npos ||
            s.find("#@#") != std::string::npos) {
            ++counts.cosmetic;
            continue;
        }
        if (s.rfind("@@", 0) == 0) {
            ++counts.exceptions;
            continue;
        }
        // A host rule may carry a modifier list: ||example.com^$third-party
        // Strip it before checking the host anchor, like the Python tool does.
        if (s.rfind("||", 0) == 0) {
            const auto dollar = s.find('$');
            const std::string head = dollar == std::string::npos ? s : s.substr(0, dollar);
            if (head.size() >= 3 && head.back() == '^') {
                const std::string domain = head.substr(2, head.size() - 3);
                if (all_domain_chars(domain)) {
                    ++counts.host_anchor;
                    if (safe_domain(domain)) domains.insert(domain);
                    continue;
                }
            }
        }
        ++counts.other;
    }

    std::cout << "FILE: " << argv[1] << '\n'
              << "LINES: " << counts.lines << '\n'
              << "  comments     " << counts.comments << '\n'
              << "  cosmetic     " << counts.cosmetic << '\n'
              << "  exceptions   " << counts.exceptions << '\n'
              << "  host_anchor  " << counts.host_anchor << '\n'
              << "  other        " << counts.other << '\n'
              << "SAFE DOMAINS: " << domains.size() << '\n';
    return 0;
}
