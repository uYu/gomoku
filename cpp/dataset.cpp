// GPL-3.0-or-later. Incremental full-game validation for offline dataset cleaning.
#include "../third_party/rapfi/Rapfi/game/board.h"
#include "../third_party/rapfi/Rapfi/eval/scoretables.h"
#include <algorithm>
#include <array>
#include <cstdint>
#include <memory>
namespace Evaluation {
Eval EVALS[RULE_NB + 1][PCODE_NB]{};
Eval EVALS_THREAT[RULE_NB + 1][THREAT_NB]{};
MoveScorePair P4SCORES[RULE_NB + 1][PCODE_NB]{};
}
namespace {
std::unique_ptr<Board> board;
int transform(int point, int symmetry) {
    int row=point/15, col=point%15;
    if (symmetry>=4) col=14-col;
    for (int n=0;n<symmetry%4;n++) { int old=row; row=col; col=14-old; }
    return row*15+col;
}
int winner(const std::array<int,225>& cells, int point) {
    const int dr[]={0,1,1,1},dc[]={1,0,1,-1};
    for(int d=0;d<4;d++) {
        int length=1;
        for(int sign:{-1,1}) {
            int r=point/15+sign*dr[d],c=point%15+sign*dc[d];
            while(r>=0&&r<15&&c>=0&&c<15&&cells[r*15+c]==cells[point]) {
                length++;r+=sign*dr[d];c+=sign*dc[d];
            }
        }
        if(cells[point]==1 ? length==5 : length>=5) return cells[point];
    }
    return 0;
}
}
#if defined(_WIN32)
#define GM_EXPORT __declspec(dllexport)
#else
#define GM_EXPORT __attribute__((visibility("default")))
#endif
extern "C" {
// Status: 0 legal, 1 duplicate, 2 continued after win, 3 black foul,
// 4 invalid input, 5 internal failure. detail = [first failing ply, winner].
GM_EXPORT int gm_dataset_validate(const int* moves,int count,int* detail) {
    detail[0]=-1;detail[1]=0;
    if(count<0||count>225) return 4;
    try {
        if(!board) board=std::make_unique<Board>(15,CandidateRange::FULL_BOARD);
        board->newGame<RENJU>();
        std::array<int,225> cells{};
        for(int ply=0;ply<count;ply++) {
            detail[0]=ply;
            int move=moves[ply];
            if(move<0||move>=225) return 4;
            if(cells[move]) return 1;
            if(detail[1]) return 2;
            Pos pos(move%15,move/15);
            if(ply%2==0&&board->checkForbiddenPoint(pos)) return 3;
            board->move<RENJU,Board::MoveType::NO_EVAL>(pos);
            cells[move]=1+ply%2;
            detail[1]=winner(cells,move);
        }
        detail[0]=-1;return 0;
    } catch(...) { return 5; }
}
// Return the legal-move mask for a validated, nonterminal prefix.
GM_EXPORT int gm_dataset_legal_mask(const int* moves,int count,uint8_t* output) {
    int detail[2];
    int status=gm_dataset_validate(moves,count,detail);
    if(status||detail[1]) return -1;
    std::array<bool,225> occupied{};
    for(int i=0;i<count;i++) occupied[moves[i]]=true;
    for(int p=0;p<225;p++) output[p]=!occupied[p] &&
        (count%2==1 || !board->checkForbiddenPoint(Pos(p%15,p/15)));
    return 0;
}
// output[0:count] = canonical D4 full move sequence;
// output[225:450] = canonical colored position after openingCount plies.
GM_EXPORT int gm_dataset_keys(const int* moves,int count,int openingCount,uint8_t* output) {
    if(count<0||count>225||openingCount<0||openingCount>count) return -1;
    std::array<uint8_t,225> bestGame{},bestOpening{};
    bestGame.fill(255);bestOpening.fill(255);
    for(int s=0;s<8;s++) {
        std::array<uint8_t,225> sequence{},opening{};
        for(int i=0;i<count;i++) {
            if(moves[i]<0||moves[i]>=225) return -1;
            int point=transform(moves[i],s);
            sequence[i]=point;
            if(i<openingCount) opening[point]=1+i%2;
        }
        if(sequence<bestGame) bestGame=sequence;
        if(opening<bestOpening) bestOpening=opening;
    }
    std::copy(bestGame.begin(),bestGame.end(),output);
    std::copy(bestOpening.begin(),bestOpening.end(),output+225);
    return 0;
}
}
