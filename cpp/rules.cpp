// GPL-3.0-or-later. Authoritative Renju legality bridge using the vendored Rapfi board.
#include "../third_party/rapfi/Rapfi/game/board.h"
#include "../third_party/rapfi/Rapfi/eval/scoretables.h"
#include <algorithm>
#include <array>
#include <memory>

namespace Evaluation {
// Legality depends on pattern tables, not model scores. Keep score storage zero.
Eval EVALS[RULE_NB + 1][PCODE_NB]{};
Eval EVALS_THREAT[RULE_NB + 1][THREAT_NB]{};
MoveScorePair P4SCORES[RULE_NB + 1][PCODE_NB]{};
}
namespace {
std::array<int, 225> input{}, previous{}, forbidden{};
std::unique_ptr<Board> board;
bool cached = false;
void prepare() {
    if (cached && input == previous) return;
    if (!board) board = std::make_unique<Board>(15, CandidateRange::FULL_BOARD);
    board->newGame<RENJU>();
    for (int i = 0; i < 225; ++i) {
        if (input[i] == 0) continue;
        if (input[i] != 1 && input[i] != 2) throw std::invalid_argument("Invalid board cell");
        Color color = input[i] == 1 ? BLACK : WHITE;
        if (board->sideToMove() != color) board->flipSide();
        board->move<RENJU, Board::MoveType::NO_EVAL>(Pos(i % 15, i / 15));
    }
    previous = input;
    cached = true;
}
int kind(int move) {
    if (move < 0 || move >= 225 || input[move]) return -1;
    Pos pos(move % 15, move / 15);
    if (!board->checkForbiddenPoint(pos)) return 0;
    const int dr[] = {0,1,1,1}, dc[] = {1,0,1,-1};
    for (int d = 0; d < 4; d++) {
        int length = 1;
        for (int sign : {-1,1}) {
            int row = move / 15 + dr[d]*sign, col = move % 15 + dc[d]*sign;
            while (row >= 0 && row < 15 && col >= 0 && col < 15 && input[row*15+col] == 1) {
                length++; row += dr[d]*sign; col += dc[d]*sign;
            }
        }
        if (length >= 6) return 3;
    }
    int fours = 0;
    for (int d = 0; d < 4; d++) {
        Pattern pattern = board->pattern(pos, BLACK, d);
        // Rapfi encodes an in-line double-four as OL even without a physical overline.
        if (pattern == OL) return 2;
        if (pattern == F4 || pattern == B4 || pattern == B4S) fours++;
    }
    return fours >= 2 ? 2 : 1;
}
}
#if defined(_WIN32)
#define GM_EXPORT __declspec(dllexport)
#else
#define GM_EXPORT __attribute__((visibility("default")))
#endif
extern "C" {
GM_EXPORT int* gm_rules_input() { return input.data(); }
GM_EXPORT int gm_rule_forbidden(int move) {
    try { prepare(); return kind(move); } catch (...) { return -2; }
}
GM_EXPORT int* gm_forbidden_map() {
    try { prepare(); for (int i=0; i<225; i++) forbidden[i] = kind(i); }
    catch (...) { forbidden.fill(-2); }
    return forbidden.data();
}
}
