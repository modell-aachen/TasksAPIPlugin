<template>
<div>
<span v-bind:class='classes'>
    <div v-if="status === 'closed'">
        <div>
            <div>{{translate(status)}}</div>
            {{closedDate}}
        </div>
    </div>
    <div v-else>
        <img v-bind:src="src" alt="" v-bind:title="title" />
    </div>
</span>
</div>
</template>


<script>
/* global moment jsi18n */
import DataFieldMixin from "../../mixins/DataFieldMixin.vue";
export default {
    mixins: [DataFieldMixin],
    methods: {
        translate(str){
            return jsi18n.get('tasksapi', str);
        }
    },
    computed: {
        classes(){
            return this.config.class.toLowerCase();
        },
        status(){
            return this.task.fields["Status"].value;
        },
        closedDate(){
            return moment.unix(parseInt(this.task.fields["Closed"].value)).toDate().toLocaleDateString();
        },
        title(){
            let $dueDate = this.task.fields["DueDate"].value;
            if(!$dueDate) return jsi18n.get('tasksapi','Missing due date');
            let $now = Math.round((new Date).getTime()/1000);
            let $in = Math.round(($dueDate - $now)/60/60/24);
            return ($in == 0)? jsi18n.get('tasksapi', "This very day") :
                   ($in == 1)? jsi18n.get('tasksapi', "In one day") :
                   ($in == -1)? jsi18n.get('tasksapi', "One day over due") :
                   ($in > 0)? jsi18n.get('tasksapi', "In [_1] days", $in) : jsi18n.get('tasksapi', "[_1] days over due", ($in*(-1)));
        },
        src(){
            let $dueDate = Math.round(parseInt(this.task.fields["DueDate"].value)/60/60/24);
            let $now = Math.round((new Date).getTime()/1000/60/60/24);
            let $ampelPath = "/pub/System/AmpelPlugin/images/";
            let $warn = parseInt((this.config.warn)?this.config.warn:'0');
            if($dueDate && $dueDate >= $now + ($warn*60*24)){
                return $ampelPath+'ampel_g.png';
            }else if($dueDate && $dueDate >= $now) {
                return $ampelPath+'ampel_o.png';
            }
            return $ampelPath+'ampel_r.png';
        }
    }
};
</script>

<style lang="sass">
.tasks > .task .status {
    color: #777;
    font-size: 11px;
    text-align: center;
    width: 75px;
}
</style>
