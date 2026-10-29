#!/usr/bin/env python3
"""Reproduce WinePy move-ordering training; choose a checkpoint by validation loss."""
import argparse
import csv
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def rows(path):
    with Path(path).open() as stream:
        return [{key.strip(): value.strip() for key, value in row.items()} for row in csv.DictReader(stream)]
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rule', choices=['freestyle', 'renju'], default='renju')
    parser.add_argument('--epochs', type=int, default=400)
    parser.add_argument('--output')
    parser.add_argument('--reuse-run', action='store_true', help='Finalize an already completed run with the same recipe')
    options = parser.parse_args()
    binary = ROOT / '.build/native/bin/pbrain-rapfi'
    if not binary.exists():
        subprocess.run(['sh', 'scripts/build-native.sh'], cwd=ROOT, check=True)
    subprocess.run(['python3', 'scripts/prepare-training.py', '--rule', options.rule], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    data_directory = ROOT / '.build/training/renju' if options.rule == 'renju' else ROOT / '.build/training'
    run_name = 'renju-policy-v1' if options.rule == 'renju' else 'winepy-policy-v2'
    output = ROOT / (options.output or ('.build/training/' + run_name))
    output.mkdir(parents=True, exist_ok=True)
    common = [str(binary), 'tuning', '--training-dataset', str(data_directory / 'train.bin'), '--validation-dataset', str(data_directory / 'validation.bin'), '--training-dataset-type', 'bin', '--validation-dataset-type', 'bin', '--config', 'models/rapfi/training-parent.toml', '--parent-model', 'models/rapfi/training-parent.bin', '--output', str(output), '--name', run_name, '--epochs', str(options.epochs), '--export-interval', '20', '--batchsize', '1024', '--threads', '2', '--seed', '20261029', '--learning-rate', '0.001', '--learning-rate-schedule', 'exponential', '--final-learning-rate', '0.0001', '--weight-decay', '0.0001', '--rules-to-tune', options.rule, '--tune-move-score', '--no-tune-eval', '--fix-scaling-factor', '--shuffle']
    if not options.reuse_run:
        with (output / 'train.log').open('w') as log:
            subprocess.run(common, cwd=ROOT, check=True, stdout=log, stderr=subprocess.STDOUT)
    stats = rows(output / 'stat.csv')
    candidates = [row for row in stats if int(row['Epoch']) > 0 and (output / f"{run_name}-e{int(row['Epoch']):05}.bin").exists()]
    best = min(candidates, key=lambda row: float(row['PolicyValLoss']))
    checkpoint = output / f"{run_name}-e{int(best['Epoch']):05}.bin"
    shutil.copyfile(checkpoint, ROOT / 'models/rapfi/trained.bin')
    parent_config = (ROOT / 'models/rapfi/training-parent.toml').read_text()
    (ROOT / 'models/rapfi/trained.toml').write_text(parent_config.replace('training-parent.bin', 'trained.bin'))
    tests = {}
    for name, model, config in [('parent', 'training-parent', 'training-parent'), ('trained', 'trained', 'trained')]:
        directory = output / ('test-' + name)
        cmd = [str(binary), 'tuning', '--config', f'models/rapfi/{config}.toml', '--parent-model', f'models/rapfi/{model}.bin', '--training-dataset', str(data_directory / 'train.bin'), '--validation-dataset', str(data_directory / 'test.bin'), '--training-dataset-type', 'bin', '--validation-dataset-type', 'bin', '--output', str(directory), '--name', name, '--epochs', '1', '--learning-rate', '0.000000001', '--threads', '2', '--rules-to-tune', options.rule, '--tune-move-score', '--no-tune-eval', '--fix-scaling-factor']
        with (output / ('test-' + name + '.log')).open('w') as log:
            subprocess.run(cmd, cwd=ROOT, check=True, stdout=log, stderr=subprocess.STDOUT)
        # Epoch zero measures the installed quantized model BEFORE any updates.
        tests[name] = float(rows(directory / 'stat.csv')[0]['PolicyValLoss'])
    report = {'model': run_name, 'rule': options.rule, 'kind': 'supervised classical move-ordering fine-tune, not a newly trained NNUE', 'parent': 'Rapfi classical model220723', 'parameter_count': 1634 if options.rule == 'renju' else 817, 'epochs': options.epochs, 'selected_epoch': int(best['Epoch']), 'selection': 'minimum validation policy loss among 20-epoch checkpoints', 'seed': 20261029, 'threads': 2, 'command': common[1:], 'dataset': json.loads((data_directory / 'manifest.json').read_text()), 'train_policy_loss_before': float(stats[0]['PolicyLoss']), 'validation_policy_loss_before': float(stats[0]['PolicyValLoss']), 'validation_policy_loss_after_float': float(best['PolicyValLoss']), 'test_quantized_policy_loss_before': tests['parent'], 'test_quantized_policy_loss_after': tests['trained'], 'test_relative_loss_reduction': 1 - tests['trained'] / tests['parent'], 'parent_sha256': digest(ROOT / 'models/rapfi/training-parent.bin'), 'trained_sha256': digest(ROOT / 'models/rapfi/trained.bin'), 'claim': 'A lower move-prediction loss is not evidence of greater playing strength; see paired match reports.'}
    (ROOT / 'models/training-report.json').write_text(json.dumps(report, indent=2) + '\n')
    shutil.copyfile(output / 'stat.csv', ROOT / 'models/training-stats.csv')
    print(json.dumps({key: value for key, value in report.items() if key not in ['dataset', 'command']}, indent=2))

if __name__ == '__main__':
    main()
