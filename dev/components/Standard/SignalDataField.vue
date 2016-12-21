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
/* global moment */
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
            return moment.unix(parseInt(this.task.fields["Closed"].value)).toDate().toLocaleDateString()
        },
        title(){
            var $dueDate = this.task.fields["DueDate"].value;
            if(!$dueDate) return jsi18n.get('tasksapi','Missing due date');
            var $now = Math.round((new Date).getTime()/1000);
            var $in = Math.round(($dueDate - $now)/60/60/24);
            return ($in == 0)? jsi18n.get('tasksapi', "This very day") : 
                   ($in == 1)? jsi18n.get('tasksapi', "In one day") : 
                   ($in == -1)? jsi18n.get('tasksapi', "One day over due") :
                   ($in > 0)? jsi18n.get('tasksapi', "In [_1] days", $in) : jsi18n.get('tasksapi', "[_1] days over due", ($in*(-1)));
        },
        src(){
            var $dueDate = Math.round(parseInt(this.task.fields["DueDate"].value)/60/60/24);
            var $now = Math.round((new Date).getTime()/1000/60/60/24);
            var $ampel_path = "/pub/System/AmpelPlugin/images/";
            var $warn = parseInt((this.config.warn)?this.config.warn:'0');
            if($dueDate && $dueDate >= $now + ($warn*60*24)){
                return $ampel_path+'ampel_g.png';
            }else if($dueDate && $dueDate >= $now) {
                return $ampel_path+'ampel_o.png';
            }
            return $ampel_path+'ampel_r.png';
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
