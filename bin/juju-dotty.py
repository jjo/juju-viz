#!/usr/bin/env python
# juju-dotty.py: juju status to DOT file converter
#
# Author: JuanJo Ciarlante <jjo@canonical.com>
# Copyright (c) 2014, Canonical Ltd.
# License: AGPLv3
#
# vim: sw=4 ts=4 et si
# pylint: disable=C0103,W0142

"""
Generate a graphviz.org DOT file from provided:
#1. "juju status" output
    juju status -o juju_status.yaml
#2. nagios livestatus output file, from:
    unixcat /var/lib/nagios3/livestatus/socket > nagios.json << EOF
GET services
Columns: host_name description state service_plugin_output
OutputFormat: json
EOF
    See http://mathias-kettner.de/checkmk_livestatus.html

Sample usage:
  %(prog)s --nagios_file nagios.json --nagios_prefix "web-prod" \
           --nagios_url http://nagios.example.com/cgi-bin/status.cgi \
           juju_status.yaml
  %(prog)s -x nrpe juju_status.yaml
  %(prog)s -i 'haprox|apache|app' -x nrpe juju_status.yaml
"""

import yaml
import sys
from argparse import ArgumentParser
import re
import json
import urllib


class DotGraph():
    '''A DOT graph, without specific extra HTML stuff'''
    def __init__(self, title, extra=None):
        self.nodes = {}
        self.edges = []
        self.title = title
        self.extra = extra

    def addnode(self, node, cluster, extras):
        '''Add a node to the graph inside cluster,
           extra is any extra text to add to as DOT attribute'''
        self.nodes[cluster] = self.nodes.get(cluster, [])
        self.nodes[cluster].append((node, extras))

    def addedge(self, n1, n2, label, extra=None):
        '''Add an edge between n1 and n2 with label'''
        self.edges.append((n1, n2, label, extra))

    def __str__(self):
        '''Return a DOT-graph formatted string'''
        graph_out = []
        graph_out.append('digraph "{}" {{'.format(self.title))
        graph_out.append('labelloc="t"\nlabel="{}"'.format(self.title))
        if self.extra:
            graph_out.append(self.extra)
        for cluster in self.nodes:
            if cluster:
                graph_out.append("subgraph cluster_{} {{".format(cluster))
            for node in self.nodes[cluster]:
                name = node[0]
                extras = node[1]
                graph_out.append('  "{0}"{1};'.format(
                    name, '[id="{}" {}]'.format(name, " ".join(extras))))
            if cluster:
                graph_out.append(('  label="{}"\n}}'.format(cluster)))
        for edge in self.edges:
            graph_out.append(('  "{0}" -> "{1}" [label="{2}" {3}];'
                              ''.format(*edge)))
        graph_out.append("}")
        return '\n'.join(graph_out)


class RuntimeState():
    '''Runtime per-unit state such as unit details (from juju status)
       and nagios status as fetched via nagios livestatus socket.'''
    def __init__(self, nagios_status_cgi, livestatus_json, nagios_prefix):
        self.nagios_status_cgi = nagios_status_cgi
        self.nagios_prefix = nagios_prefix
        self.units_desc = {}
        self.nagios_crit = {}
        self.nagios_tooltip = {}
        self.nagios_state = None
        if livestatus_json and nagios_prefix:
            self.nagios_state = json.load(open(livestatus_json))
            # NOTE hostname, servicename, ... below are *nagios*
            # names (e.g. servicename is a nagios service name)
            for (hostname, servicename, state,
                 service_plugin_output) in self.nagios_state:
                num_crit = self.nagios_crit.get(hostname, 0)
                num_crit += (1 if state == 2 else 0)
                self.nagios_crit[hostname] = num_crit
                self.nagios_tooltip.setdefault(hostname, [
                    '{}: '.format(hostname)])
                # unit has nagios alerts, add nagios servicename, alert text
                # newline separated
                if state == 2:
                    service_plugin_output = service_plugin_output.replace(
                        '<', '&lt;')
                    service_plugin_output = service_plugin_output.replace(
                        '>', '&gt;')
                    self.nagios_tooltip[hostname].append(
                        '{}:&#10;{}'.format(servicename,
                                            service_plugin_output))

    def add_unit_state(self, unitname, public_address, agent_state,
                       subs_states, extra):
        '''Add unitstate, keyed by its juju unitname,
           to be used by "...".format(**dict) calls,
           to overload embedded HTML'''
        dashed_unitname = unitname.replace('/', '-')
        unit_flag = ''
        unitcolor = 'white'
        all_states = subs_states
        all_states.insert(0, agent_state)
        for state in all_states:
            if not state == 'started':
                unit_flag = unit_flag + '!'
                unitcolor = 'yellow'
        self.units_desc[unitname] = {
            'unitname': unitname,
            'agent_state': agent_state,
            'unitcolor': unitcolor,
            'unit-num': '{}/{}'.format(unit_flag, unitname.split('/')[1]),
            'dashed-unitname': dashed_unitname,
            'extra': extra,
            'helpurl': 'data:text/html,juju ssh {}%3cbr%3e{}'.format(
                unitname, urllib.quote_plus(extra)),
            'tooltip': "unit: {}{}".format(unitname, extra),
        }

        # Nagios specific data:
        if self.nagios_state is None:
            return

        # hostname mapping as done by nrpe-external-master e.g.
        #  nagios_prefix   unit_name
        #   ("web-prod",   "haproxy/0" ) -> web-prod-haproxy-0
        dashed_svc_hostname = "{}-{}".format(self.nagios_prefix,
                                             dashed_unitname)
        # try dashed_svc_hostname and public-address from unit (it'll be
        # physical hostname for e.g. maas units)
        for nagios_hostname_key in (public_address, dashed_svc_hostname):
            # number of firing nagios alerts for these units
            num_crit = self.nagios_crit.get(nagios_hostname_key, -1)
            if num_crit != -1:
                break
        # aggregate tooltip from alerts's text:
        # - newline separated and cleaned up from double quotes
        # - if no nagios entry, leave tooltip as <nagios_hostname>:
        tooltip_text = "&#10;* ".join(
            self.nagios_tooltip.get(nagios_hostname_key,
                                    ('{}: '.format(nagios_hostname_key),))
        ).replace('"', '_')
        # num_crit background color mapping
        color = {1: "red", 0: "lightgreen", -1: "lightgrey"}[cmp(num_crit, 0)]

        self.units_desc[unitname].update({
            'nagios-hostname': nagios_hostname_key,
            'nagios-color': color,
            'nagios-prefix': self.nagios_prefix,
            'nagios-num-crit': num_crit,
            'nagios-url': self.nagios_status_cgi + '?host={}'.format(
                nagios_hostname_key),
            'nagios-tip': tooltip_text,
        })

    def get_unit_state(self, unitname, html_tmpl):
        '''Try filing passed HTML template with values from units_desc'''
        unit_desc = self.units_desc[unitname]
        try:
            html = html_tmpl.format(**unit_desc)
        except KeyError:
            html = ""
        return html


def extra_html_table(servicename, charmname, units, runtime):
    '''This is a kinda "throw everything else" here, granted
       next lines are full of logic+display mixed nastiness'''
    # Ugly hack for mono-valued numeric only juju revision:
    # try decoding source and charm revnos from charm revision,
    # which supposedly got generated by:
    #  printf ("%d0%d0%02d", code_revno, charm_revno, 1)
    # eg for code_revno=399 charm_revno=12 -> 399012001
    charm_revhack_re = re.compile(r'^([1-9][0-9]*)0([1-9][0-9]*)([0-9]{3})$')
    charm_revhack_match = charm_revhack_re.match(charmname.split('-')[-1])
    revhack_tmpl = ('</TR><TR><td><font point-size="10">code-r{0} '
                    'charm-r{1}</font></td>')
    if charm_revhack_match:
        charm_revhack_str = revhack_tmpl.format(*charm_revhack_match.groups())
    else:
        charm_revhack_str = ""
    html_units = ('\n  <td bgcolor="{unitcolor}" tooltip="{tooltip}" '
                  'href="#unit={unitname}">'
                  '<font point-size="10">{unit-num}</font></td>')
    td_units = "".join([runtime.get_unit_state(unit, html_units)
                        for unit in sorted(units)])
    html_nagios = ('\n  <td bgcolor="{nagios-color}" id="{nagios-hostname}" '
                   'tooltip="{nagios-tip}" '
                   'href="{nagios-url}" target="nagios_tag">'
                   '<font point-size="10">{nagios-num-crit}</font></td>')
    td_nagios = "".join([runtime.get_unit_state(unit, html_nagios)
                         for unit in sorted(units)])
    return ('tooltip="{}"'.format(servicename),
            '\nlabel=<<TABLE BORDER="0" CELLBORDER="0">\n'
            '<TR><td href="#service={}">{}</td>\n'
            ''.format(servicename, servicename) + td_units + '\n</TR>\n' +
            '<TR><td><font point-size="10">{}</font></td>'.format(charmname) +
            td_nagios + charm_revhack_str + '\n</TR></TABLE>>')


def _agent_state(state):
    "Return 'started' (v1 compat) if units + subords states are healthy"
    agent_state = "Unknown"
    if 'agent-state' in state:
        agent_state = state.get('agent-state')
    elif 'juju-status' in state:
        agent_state = state['juju-status']['current']
        if agent_state in ('idle', 'executing'):
            agent_state = 'started'
    return agent_state


def get_agent_status(unit_status):
    agent_state = _agent_state(unit_status)
    subs = unit_status.get('subordinates') or {}
    subs_states = [_agent_state(v) for v in subs.values()]
    return (agent_state, subs_states)


def parse_status_and_print_dot(juju_machines, juju_services, args):
    '''Print generated dotfile to stdout'''

    runtime = RuntimeState(args.nagios_url, args.nagios_file,
                           args.nagios_prefix)
    graph = DotGraph(args.title or args.nagios_prefix,
                     'URL="#service=__all__"')

    machine_to_instance_id = {k: v.get("instance-id", None)
                              for k, v in juju_machines.items()}
    service_label = {}
    # Nodes:
    for service, service_dict in juju_services.iteritems():
        if juju_services and service not in juju_services:
            continue
        charmname = service_dict["charm"]
        # leave only charmname as after the "/"
        charmname = charmname[charmname.index("/") + 1:]
        units = service_dict.get("units", 0)
        if not units:
            continue
        service_label[service] = service
        extras = []
        # hack: if an exposed service, use a "house" (~arrow) to draw it
        if service_dict.get('exposed'):
            extras.append("shape=house")
        # hack: if a DB~ish service, use a box
        if "sql" in charmname or "db" in charmname:
            extras.append("shape=box")
        for unit in units:
            machine = units[unit]['machine']
            extra = (
                "&#10;machine: {}&#10;"
                "instance-id: {}&#10;"
                "public-address: {}&#10;"
                "open-ports: {}&#10;"
                "agent-state: {}").format(
                    machine,
                    machine_to_instance_id.get(str(machine)),
                    units[unit].get('public-address', ''),
                    units[unit].get('open-ports', '[]'),
                    _agent_state(units[unit])
                )
            agent_state, subs_states = get_agent_status(units[unit])
            public_address = units[unit].get('public-address')
            runtime.add_unit_state(unit, public_address, agent_state,
                                   subs_states, extra)
        extras.extend(extra_html_table(service, charmname, units, runtime))
        graph.addnode(service, "", extras)
    # Edges:
    for service, service_dict in sorted(juju_services.iteritems()):
        if service not in service_label:
            continue
        for rel_name in service_dict.get('relations', {}):
            for target in service_dict['relations'][rel_name]:
                if target in service_label:
                    graph.addedge(service, target, rel_name, "fonsize=10")
    print(graph)

p = ArgumentParser(description='Juju status DOT file generator')
p.add_argument('files', type=str, nargs='+',
               help='file with "juju status" output, or "-" for stdin')
p.add_argument('--nagios_file', type=str, action='store', nargs='?',
               help="JSON nagios status file, from livestatus")
p.add_argument('--nagios_url', type=str, action='store', nargs='?',
               help="nagios url, e.g. nagios.example.com"
               "/cgi-bin/nagios3/status.cgi")
p.add_argument('--nagios_prefix', type=str, action='store', nargs='?',
               help="nagios prefix as set by nrpe-external-master, "
               "e.g. web-production")
p.add_argument('-x', '--exclude', type=str, action='store',
               help='exclude services that match this string regex, eg: '
                    '"apache|haproxy"')
p.add_argument('-i', '--include', type=str, action='store',
               help='exclude services which have this string, eg.: "nrpe"')
p.add_argument('-o', '--output', type=str, action='store',
               help='filename to save output, else stdout')
p.add_argument('-t', '--title', type=str, action='store',
               help='graph title')
p.add_argument('-k', '--key-value', type=str, nargs='+',
               help='arbitrary key=value pairs to add to .json output file')
cmd_args = p.parse_args()

for filename in cmd_args.files:
    if filename == '-':
        input_file = sys.stdin
    else:
        input_file = open(filename)

    if cmd_args.output:
        sys.stdout = open(cmd_args.output, 'w')

    juju_status = yaml.safe_load(input_file)
    if not juju_status:
        print >> sys.stderr, "ERROR: {} doesn't parse as YAML", format(
            filename)
        continue

    for key in ('services', 'applications'):
        if key in juju_status:
            services = juju_status.get(key)
    machines = juju_status.get('machines', None)
    if not services:
        print >> sys.stderr, "ERROR: no juju services found from {}".format(
            filename)
        continue

    if cmd_args.exclude:
        exclude_re = re.compile('.*({}).*'.format(cmd_args.exclude))
        services = dict([x for x in services.iteritems()
                         if not exclude_re.match(x[0])])
    if cmd_args.include:
        include_re = re.compile('.*({}).*'.format(cmd_args.include))
        services = dict([x for x in services.iteritems()
                         if include_re.match(x[0])])

    print("\n// juju dot viz for {}:".format(filename))
    sys.stdout.flush()
    parse_status_and_print_dot(machines, services, cmd_args)
    if cmd_args.output:
        json_text = {}
        if cmd_args.key_value:
            json_text.update({k: v for k, v in [kv.split('=', 1)
                                                for kv in cmd_args.key_value]})
        json_text['services'] = services
        json.dump(json_text, open(cmd_args.output + ".json", "w"))
